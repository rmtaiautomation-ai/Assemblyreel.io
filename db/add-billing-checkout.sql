-- DRAFT / UNAPPLIED. Requires add-billing-accounts.sql. Server-private attempts
-- block concurrent/ambiguous duplicate subscriptions, including across keys.
BEGIN;
CREATE TABLE public.billing_checkout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  stripe_mode text NOT NULL CHECK (stripe_mode IN ('test', 'live')),
  operation_key text NOT NULL CHECK (length(operation_key) BETWEEN 8 AND 128),
  input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
  plan_id text NOT NULL CHECK (plan_id IN ('creator', 'pro', 'studio')),
  catalog_version text NOT NULL CHECK (length(btrim(catalog_version)) > 0),
  billing_interval text NOT NULL CHECK (billing_interval IN ('month', 'year')),
  stripe_price_id text NOT NULL CHECK (stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  amount bigint NOT NULL CHECK (amount BETWEEN 1 AND 9007199254740991),
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'ready', 'unknown', 'expired', 'complete')),
  stripe_session_id text,
  checkout_url text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, stripe_mode) REFERENCES public.billing_accounts(id, stripe_mode),
  UNIQUE (account_id, operation_key),
  UNIQUE (stripe_mode, stripe_session_id),
  CHECK (state <> 'ready' OR (stripe_session_id IS NOT NULL AND checkout_url IS NOT NULL AND expires_at IS NOT NULL))
);
CREATE UNIQUE INDEX billing_one_open_checkout ON public.billing_checkout_attempts(account_id)
  WHERE state IN ('pending', 'ready', 'unknown');
ALTER TABLE public.billing_checkout_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_checkout_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_checkout_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.billing_checkout_attempts TO service_role;
GRANT UPDATE (state, stripe_session_id, checkout_url, expires_at, updated_at) ON public.billing_checkout_attempts TO service_role;

CREATE FUNCTION public.begin_billing_checkout(
  p_account_id uuid, p_actor_id uuid, p_operation_key text, p_input_fingerprint text,
  p_plan_id text, p_catalog_version text, p_interval text, p_price_id text, p_amount bigint, p_currency text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
DECLARE
  account public.billing_accounts%ROWTYPE;
  attempt public.billing_checkout_attempts%ROWTYPE;
BEGIN
  SELECT * INTO account FROM public.billing_accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND OR p_actor_id IS NULL OR account.user_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OWNERSHIP_REQUIRED';
  END IF;
  IF NOT account.enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_DISABLED';
  END IF;
  SELECT * INTO attempt FROM public.billing_checkout_attempts
    WHERE account_id = p_account_id AND operation_key = p_operation_key FOR UPDATE;
  IF FOUND THEN
    IF attempt.input_fingerprint IS DISTINCT FROM p_input_fingerprint
      OR attempt.plan_id IS DISTINCT FROM p_plan_id OR attempt.catalog_version IS DISTINCT FROM p_catalog_version
      OR attempt.billing_interval IS DISTINCT FROM p_interval OR attempt.stripe_price_id IS DISTINCT FROM p_price_id
      OR attempt.amount IS DISTINCT FROM p_amount OR attempt.currency IS DISTINCT FROM p_currency THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OPERATION_CONFLICT';
    END IF;
    RETURN jsonb_build_object('id', attempt.id, 'state', attempt.state, 'created', false,
      'url', attempt.checkout_url, 'expiresAt', attempt.expires_at);
  END IF;
  IF EXISTS (SELECT 1 FROM public.billing_checkout_attempts WHERE account_id = p_account_id
    AND state IN ('pending', 'ready', 'unknown')) OR EXISTS (
    SELECT 1 FROM public.billing_subscriptions WHERE account_id = p_account_id AND is_current
    AND status NOT IN ('canceled', 'incomplete_expired')) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OPERATION_CONFLICT';
  END IF;
  INSERT INTO public.billing_checkout_attempts(account_id, stripe_mode, operation_key, input_fingerprint,
    plan_id, catalog_version, billing_interval, stripe_price_id, amount, currency)
    VALUES (p_account_id, account.stripe_mode, p_operation_key, p_input_fingerprint,
      p_plan_id, p_catalog_version, p_interval, p_price_id, p_amount, p_currency) RETURNING * INTO attempt;
  RETURN jsonb_build_object('id', attempt.id, 'state', attempt.state, 'created', true, 'url', NULL, 'expiresAt', NULL);
END;
$$;

CREATE FUNCTION public.bind_billing_customer(p_account_id uuid, p_actor_id uuid, p_customer_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE account public.billing_accounts%ROWTYPE;
BEGIN
  IF p_customer_id IS NULL OR p_customer_id !~ '^cus_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_REQUEST';
  END IF;
  SELECT * INTO account FROM public.billing_accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND OR p_actor_id IS NULL OR account.user_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OWNERSHIP_REQUIRED';
  END IF;
  IF account.stripe_customer_id IS NOT NULL AND account.stripe_customer_id <> p_customer_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OPERATION_CONFLICT';
  END IF;
  UPDATE public.billing_accounts SET stripe_customer_id = p_customer_id, updated_at = clock_timestamp() WHERE id = p_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_billing_checkout(uuid, uuid, text, text, text, text, text, text, bigint, text),
  public.bind_billing_customer(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_billing_checkout(uuid, uuid, text, text, text, text, text, text, bigint, text),
  public.bind_billing_customer(uuid, uuid, text) TO service_role;
COMMIT;
