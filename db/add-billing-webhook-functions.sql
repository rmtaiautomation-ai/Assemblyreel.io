-- DRAFT / UNAPPLIED. Requires accounts, usage, usage-windows and checkout.
-- Durable receipts contain identifiers, never raw webhook/payment payloads.
BEGIN;
CREATE TABLE public.billing_sync_leases (
  account_id uuid PRIMARY KEY REFERENCES public.billing_accounts(id),
  stripe_mode text NOT NULL,
  stripe_event_id text NOT NULL,
  token uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (account_id, stripe_mode) REFERENCES public.billing_accounts(id, stripe_mode),
  FOREIGN KEY (stripe_mode, stripe_event_id) REFERENCES public.billing_webhook_events(stripe_mode, stripe_event_id)
);
ALTER TABLE public.billing_sync_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_sync_leases FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_sync_leases FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_sync_leases TO service_role;

CREATE FUNCTION public.record_billing_webhook(p_mode text, p_event_id text, p_type text, p_object_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE receipt public.billing_webhook_events%ROWTYPE;
BEGIN
  INSERT INTO public.billing_webhook_events(stripe_mode, stripe_event_id, event_type, object_id)
    VALUES (p_mode, p_event_id, p_type, p_object_id) ON CONFLICT (stripe_mode, stripe_event_id) DO NOTHING;
  SELECT * INTO receipt FROM public.billing_webhook_events WHERE stripe_mode = p_mode AND stripe_event_id = p_event_id;
  IF receipt.event_type IS DISTINCT FROM p_type OR receipt.object_id IS DISTINCT FROM p_object_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OPERATION_CONFLICT';
  END IF;
END;
$$;

CREATE FUNCTION public.claim_billing_webhook(p_account_id uuid, p_mode text, p_event_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  account public.billing_accounts%ROWTYPE;
  receipt public.billing_webhook_events%ROWTYPE;
  lease public.billing_sync_leases%ROWTYPE;
  claim_token uuid;
  checked_at timestamptz;
BEGIN
  SELECT * INTO account FROM public.billing_accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND OR account.stripe_mode <> p_mode THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OWNERSHIP_REQUIRED';
  END IF;
  SELECT * INTO receipt FROM public.billing_webhook_events
    WHERE stripe_mode = p_mode AND stripe_event_id = p_event_id FOR UPDATE;
  IF NOT FOUND OR (receipt.account_id IS NOT NULL AND receipt.account_id <> p_account_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OPERATION_CONFLICT';
  END IF;
  IF receipt.status IN ('processed', 'ignored') THEN
    RETURN jsonb_build_object('claimed', false, 'status', receipt.status, 'token', NULL);
  END IF;
  checked_at := clock_timestamp();
  SELECT * INTO lease FROM public.billing_sync_leases WHERE account_id = p_account_id FOR UPDATE;
  IF FOUND AND lease.expires_at > checked_at THEN
    RETURN jsonb_build_object('claimed', false, 'status', 'busy', 'token', NULL);
  END IF;
  claim_token := gen_random_uuid();
  INSERT INTO public.billing_sync_leases(account_id, stripe_mode, stripe_event_id, token, expires_at)
    VALUES (p_account_id, p_mode, p_event_id, claim_token, checked_at + interval '90 seconds')
    ON CONFLICT (account_id) DO UPDATE SET stripe_mode = EXCLUDED.stripe_mode,
      stripe_event_id = EXCLUDED.stripe_event_id, token = EXCLUDED.token, expires_at = EXCLUDED.expires_at;
  UPDATE public.billing_webhook_events SET status = 'processing', account_id = p_account_id,
    attempts = attempts + 1, completed_at = NULL, last_error_code = NULL
    WHERE stripe_mode = p_mode AND stripe_event_id = p_event_id;
  RETURN jsonb_build_object('claimed', true, 'status', 'processing', 'token', claim_token);
END;
$$;

CREATE FUNCTION public.ignore_billing_webhook(p_mode text, p_event_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.billing_webhook_events SET status = 'ignored', completed_at = clock_timestamp()
    WHERE stripe_mode = p_mode AND stripe_event_id = p_event_id AND account_id IS NULL
    AND status IN ('received', 'failed');
  -- Only unclaimed/unsupported receipts, never a processing account sync.
END;
$$;

-- A stale worker cannot publish a projection after its lease was reclaimed.
-- Called by both webhook delivery and reconciliation with freshly retrieved
-- Stripe state. Subscription, window counters and receipt complete together.
CREATE FUNCTION public.apply_billing_subscription(
  p_account_id uuid, p_mode text, p_event_id text, p_token uuid,
  p_projection jsonb, p_limits jsonb DEFAULT NULL,
  p_window_start timestamptz DEFAULT NULL, p_window_end timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  account public.billing_accounts%ROWTYPE;
  current_subscription public.billing_subscriptions%ROWTYPE;
  existing_subscription public.billing_subscriptions%ROWTYPE;
  attempt public.billing_checkout_attempts%ROWTYPE;
  lease public.billing_sync_leases%ROWTYPE;
  subscription_id uuid;
  make_current boolean := false;
  checked_at timestamptz;
BEGIN
  SELECT * INTO account FROM public.billing_accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND OR account.stripe_mode <> p_mode
    OR account.stripe_customer_id IS DISTINCT FROM p_projection->>'customerId' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OWNERSHIP_REQUIRED';
  END IF;
  SELECT * INTO lease FROM public.billing_sync_leases WHERE account_id = p_account_id FOR UPDATE;
  checked_at := clock_timestamp();
  IF NOT FOUND OR p_token IS NULL OR lease.token <> p_token OR lease.stripe_mode <> p_mode
    OR lease.stripe_event_id <> p_event_id OR lease.expires_at <= checked_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_SYNC_PENDING';
  END IF;
  IF p_projection IS NULL OR jsonb_typeof(p_projection) <> 'object'
    OR (p_projection->>'verifiedAt')::timestamptz IS NULL
    OR (p_projection->>'verifiedAt')::timestamptz > checked_at
    OR (p_projection->>'verifiedAt')::timestamptz < checked_at - interval '5 minutes' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_SYNC_PENDING';
  END IF;
  SELECT * INTO current_subscription FROM public.billing_subscriptions
    WHERE account_id = p_account_id AND is_current FOR UPDATE;
  SELECT * INTO existing_subscription FROM public.billing_subscriptions
    WHERE stripe_mode = p_mode AND stripe_subscription_id = p_projection->>'stripeSubscriptionId' FOR UPDATE;
  IF FOUND AND existing_subscription.account_id <> p_account_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OWNERSHIP_REQUIRED';
  END IF;
  IF current_subscription.stripe_subscription_id = p_projection->>'stripeSubscriptionId' THEN
    make_current := true;
  ELSIF (current_subscription.id IS NULL OR current_subscription.status IN ('canceled', 'incomplete_expired'))
    AND existing_subscription.id IS NULL THEN
    -- Only an app-linked checkout can establish/replace the current subscription.
    -- Historical subscriptions cannot regain authority after a replacement.
    SELECT * INTO attempt FROM public.billing_checkout_attempts
      WHERE id = (p_projection->>'checkoutAttemptId')::uuid AND account_id = p_account_id
      AND stripe_mode = p_mode FOR UPDATE;
    IF NOT FOUND OR attempt.stripe_price_id IS DISTINCT FROM p_projection->>'priceId'
      OR attempt.plan_id IS DISTINCT FROM p_projection->>'planId'
      OR attempt.catalog_version IS DISTINCT FROM p_projection->>'catalogVersion'
      OR attempt.billing_interval IS DISTINCT FROM p_projection->>'billingInterval'
      OR attempt.state NOT IN ('pending', 'ready', 'unknown', 'complete') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_SYNC_PENDING';
    END IF;
    IF current_subscription.id IS NOT NULL THEN
      UPDATE public.billing_subscriptions SET is_current = false, updated_at = checked_at WHERE id = current_subscription.id;
    END IF;
    make_current := true;
    UPDATE public.billing_checkout_attempts SET state = 'complete', updated_at = checked_at WHERE id = attempt.id;
  END IF;
  INSERT INTO public.billing_subscriptions(account_id, stripe_mode, stripe_subscription_id, stripe_price_id,
    plan_id, catalog_version, status, billing_interval, is_current, cancel_at_period_end, pause_collection,
    current_period_start, current_period_end, access_starts_at, access_expires_at, trial_ends_at, verified_at)
    VALUES (p_account_id, p_mode, p_projection->>'stripeSubscriptionId', p_projection->>'priceId',
      p_projection->>'planId', p_projection->>'catalogVersion', p_projection->>'status',
      p_projection->>'billingInterval', make_current, (p_projection->>'cancelAtPeriodEnd')::boolean,
      (p_projection->>'pauseCollection')::boolean, (p_projection->>'periodStart')::timestamptz,
      (p_projection->>'periodEnd')::timestamptz, (p_projection->>'accessStartsAt')::timestamptz,
      (p_projection->>'accessExpiresAt')::timestamptz, (p_projection->>'trialEndsAt')::timestamptz,
      (p_projection->>'verifiedAt')::timestamptz)
    ON CONFLICT (stripe_mode, stripe_subscription_id) DO UPDATE SET
      stripe_price_id = EXCLUDED.stripe_price_id, plan_id = EXCLUDED.plan_id, catalog_version = EXCLUDED.catalog_version,
      status = EXCLUDED.status, billing_interval = EXCLUDED.billing_interval, is_current = EXCLUDED.is_current,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end, pause_collection = EXCLUDED.pause_collection,
      current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end,
      access_starts_at = EXCLUDED.access_starts_at, access_expires_at = EXCLUDED.access_expires_at,
      trial_ends_at = EXCLUDED.trial_ends_at, verified_at = EXCLUDED.verified_at, updated_at = checked_at
    RETURNING id INTO subscription_id;
  IF p_limits IS NOT NULL AND make_current THEN
    PERFORM public.sync_billing_usage_window(p_account_id, subscription_id, p_window_start, p_window_end,
      p_projection->>'catalogVersion', p_limits);
  END IF;
  UPDATE public.billing_webhook_events SET status = 'processed', completed_at = checked_at, last_error_code = NULL
    WHERE stripe_mode = p_mode AND stripe_event_id = p_event_id AND account_id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_SYNC_PENDING';
  END IF;
  DELETE FROM public.billing_sync_leases WHERE account_id = p_account_id;
  RETURN jsonb_build_object('subscriptionId', subscription_id, 'isCurrent', make_current);
END;
$$;

CREATE FUNCTION public.fail_billing_webhook(p_account_id uuid, p_mode text, p_event_id text, p_token uuid, p_error_code text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_error_code IS NULL OR p_error_code !~ '^[A-Z0-9_]{1,64}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_REQUEST';
  END IF;
  PERFORM 1 FROM public.billing_accounts WHERE id = p_account_id FOR UPDATE;
  PERFORM 1 FROM public.billing_sync_leases WHERE account_id = p_account_id AND stripe_mode = p_mode
    AND stripe_event_id = p_event_id AND token = p_token AND expires_at > clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_SYNC_PENDING';
  END IF;
  UPDATE public.billing_webhook_events SET status = 'failed', last_error_code = p_error_code, completed_at = NULL
    WHERE stripe_mode = p_mode AND stripe_event_id = p_event_id AND account_id = p_account_id;
  DELETE FROM public.billing_sync_leases WHERE account_id = p_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_billing_webhook(text, text, text, text),
  public.ignore_billing_webhook(text, text),
  public.claim_billing_webhook(uuid, text, text),
  public.apply_billing_subscription(uuid, text, text, uuid, jsonb, jsonb, timestamptz, timestamptz),
  public.fail_billing_webhook(uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_billing_webhook(text, text, text, text),
  public.ignore_billing_webhook(text, text),
  public.claim_billing_webhook(uuid, text, text),
  public.apply_billing_subscription(uuid, text, text, uuid, jsonb, jsonb, timestamptz, timestamptz),
  public.fail_billing_webhook(uuid, text, text, uuid, text) TO service_role;
COMMIT;
