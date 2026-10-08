-- DRAFT / UNAPPLIED. Apply after the accounts and usage migrations in staging.
-- These SECURITY INVOKER RPCs are service-role only: never expose an admin
-- client to the browser. The caller must verify auth, resource ownership, the
-- approved catalog, and bounded provider inputs before reserving.
BEGIN;

CREATE FUNCTION public.reserve_billing_operation(
  p_account_id uuid, p_actor_id uuid, p_resource_id uuid,
  p_operation_key text, p_input_fingerprint text,
  p_catalog_version text, p_items jsonb, p_max_pending integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
DECLARE
  account public.billing_accounts%ROWTYPE;
  subscription public.billing_subscriptions%ROWTYPE;
  operation public.billing_operations%ROWTYPE;
  period public.billing_usage_periods%ROWTYPE;
  item record;
  original_items jsonb;
  quantity bigint;
  checked_at timestamptz;
  matching_periods integer;
BEGIN
  IF p_actor_id IS NULL OR p_operation_key IS NULL
    OR length(p_operation_key) NOT BETWEEN 8 AND 128
    OR p_input_fingerprint IS NULL OR p_input_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_catalog_version IS NULL OR length(btrim(p_catalog_version)) = 0
    OR p_max_pending IS NULL OR p_max_pending NOT BETWEEN 1 AND 100
    OR p_items IS NULL OR jsonb_typeof(p_items) <> 'object' OR p_items = '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_RESERVATION';
  END IF;
  FOR item IN SELECT key, value FROM jsonb_each(p_items) LOOP
    IF item.key NOT IN ('projects', 'images', 'video_seconds', 'narration_characters',
      'transcription_seconds', 'llm_tokens', 'render_seconds', 'storage_bytes')
      OR jsonb_typeof(item.value) <> 'number' OR item.value::text !~ '^[1-9][0-9]{0,15}$'
      OR item.value::text::numeric > 9007199254740991 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_RESERVATION';
    END IF;
  END LOOP;

  -- All reserve/settle calls lock account first. This deliberately serializes
  -- one account's ledger and avoids multi-metric lock-order deadlocks.
  SELECT * INTO account FROM public.billing_accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND OR account.user_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OWNERSHIP_REQUIRED';
  END IF;
  SELECT * INTO operation FROM public.billing_operations
    WHERE account_id = p_account_id AND operation_key = p_operation_key FOR UPDATE;
  IF FOUND THEN
    SELECT jsonb_object_agg(reservation.metric, reservation.quantity) INTO original_items
      FROM public.billing_operation_items AS reservation WHERE reservation.operation_id = operation.id;
    IF operation.resource_id IS DISTINCT FROM p_resource_id
      OR operation.input_fingerprint <> p_input_fingerprint OR original_items IS DISTINCT FROM p_items THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OPERATION_CONFLICT';
    END IF;
    -- A replay is read/recovery only, never permission to submit a provider again.
    RETURN jsonb_build_object('id', operation.id, 'state', operation.state, 'created', false);
  END IF;

  checked_at := clock_timestamp();
  SELECT * INTO subscription FROM public.billing_subscriptions
    WHERE account_id = p_account_id AND is_current FOR UPDATE;
  IF NOT account.enabled OR NOT FOUND OR subscription.status <> 'active'
    OR subscription.pause_collection OR subscription.verified_at IS NULL
    OR subscription.verified_at > checked_at OR subscription.access_starts_at IS NULL
    OR subscription.access_expires_at IS NULL OR subscription.access_starts_at > checked_at
    OR subscription.access_expires_at <= checked_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_REQUIRED';
  END IF;
  IF subscription.catalog_version IS DISTINCT FROM p_catalog_version OR subscription.plan_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLAN_NOT_CONFIGURED';
  END IF;
  IF (SELECT count(*) FROM public.billing_operations WHERE account_id = p_account_id
    AND state IN ('reserved', 'submitted', 'unknown')) >= p_max_pending THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CONCURRENCY_LIMIT';
  END IF;

  INSERT INTO public.billing_operations(account_id, resource_id, operation_key, input_fingerprint)
    VALUES (p_account_id, p_resource_id, p_operation_key, p_input_fingerprint) RETURNING * INTO operation;
  FOR item IN SELECT key, value FROM jsonb_each(p_items) ORDER BY key LOOP
    quantity := item.value::text::bigint;
    SELECT count(*) INTO matching_periods FROM public.billing_usage_periods
      WHERE account_id = p_account_id AND metric = item.key
      AND window_start <= checked_at AND window_end > checked_at;
    IF matching_periods <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_SYNC_PENDING';
    END IF;
    SELECT * INTO period FROM public.billing_usage_periods
      WHERE account_id = p_account_id AND metric = item.key
      AND window_start <= checked_at AND window_end > checked_at FOR UPDATE;
    IF period.subscription_id IS DISTINCT FROM subscription.id
      OR period.catalog_version <> p_catalog_version THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_SYNC_PENDING';
    END IF;
    IF quantity > period.limit_quantity - period.used_quantity - period.reserved_quantity THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'LIMIT_REACHED';
    END IF;
    UPDATE public.billing_usage_periods SET reserved_quantity = reserved_quantity + quantity,
      updated_at = checked_at WHERE id = period.id;
    INSERT INTO public.billing_operation_items(operation_id, account_id, usage_period_id, metric, quantity)
      VALUES (operation.id, p_account_id, period.id, item.key, quantity);
  END LOOP;
  RETURN jsonb_build_object('id', operation.id, 'state', operation.state, 'created', true);
END;
$$;

CREATE FUNCTION public.settle_billing_operation(
  p_account_id uuid, p_operation_id uuid, p_outcome text,
  p_provider text DEFAULT NULL, p_provider_request_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
DECLARE
  operation public.billing_operations%ROWTYPE;
  item record;
  target_state text;
  checked_at timestamptz;
BEGIN
  target_state := CASE p_outcome WHEN 'provider_accepted' THEN 'submitted'
    WHEN 'submission_uncertain' THEN 'unknown' WHEN 'provider_completed' THEN 'committed'
    WHEN 'no_work_confirmed' THEN 'released' END;
  IF target_state IS NULL OR (p_provider IS NOT NULL AND length(btrim(p_provider)) NOT BETWEEN 1 AND 64)
    OR (p_provider_request_id IS NOT NULL AND length(btrim(p_provider_request_id)) NOT BETWEEN 1 AND 256)
    OR (p_error_code IS NOT NULL AND p_error_code !~ '^[A-Z0-9_]{1,64}$')
    OR (p_outcome = 'provider_accepted' AND (p_provider IS NULL OR p_provider_request_id IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_TRANSITION';
  END IF;
  PERFORM 1 FROM public.billing_accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OPERATION_NOT_FOUND';
  END IF;
  SELECT * INTO operation FROM public.billing_operations
    WHERE id = p_operation_id AND account_id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OPERATION_NOT_FOUND';
  END IF;
  IF (operation.provider IS NOT NULL AND p_provider IS NOT NULL AND operation.provider <> p_provider)
    OR (operation.provider_request_id IS NOT NULL AND p_provider_request_id IS NOT NULL
      AND operation.provider_request_id <> p_provider_request_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OPERATION_CONFLICT';
  END IF;
  IF operation.state IN ('committed', 'released') THEN
    IF operation.state <> target_state THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_TRANSITION';
    END IF;
    RETURN jsonb_build_object('id', operation.id, 'state', operation.state, 'changed', false);
  END IF;
  checked_at := clock_timestamp();
  IF target_state IN ('committed', 'released') THEN
    -- Use ORIGINAL items/windows, including after cancellation, renewal, auth
    -- deletion or account disabling. No age/timeout-based automatic refund.
    FOR item IN SELECT * FROM public.billing_operation_items
      WHERE operation_id = operation.id ORDER BY metric LOOP
      UPDATE public.billing_usage_periods SET reserved_quantity = reserved_quantity - item.quantity,
        used_quantity = used_quantity + CASE WHEN target_state = 'committed' THEN item.quantity ELSE 0 END,
        updated_at = checked_at WHERE id = item.usage_period_id AND reserved_quantity >= item.quantity;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'USAGE_INVARIANT_BROKEN';
      END IF;
    END LOOP;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'USAGE_INVARIANT_BROKEN';
    END IF;
  END IF;
  UPDATE public.billing_operations SET state = target_state,
    provider = coalesce(provider, p_provider), provider_request_id = coalesce(provider_request_id, p_provider_request_id),
    last_error_code = p_error_code, updated_at = checked_at,
    submitted_at = CASE WHEN target_state = 'submitted' THEN coalesce(submitted_at, checked_at) ELSE submitted_at END,
    settled_at = CASE WHEN target_state IN ('committed', 'released') THEN checked_at ELSE NULL END
    WHERE id = operation.id;
  RETURN jsonb_build_object('id', operation.id, 'state', target_state, 'changed', operation.state <> target_state);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_billing_operation(uuid, uuid, uuid, text, text, text, jsonb, integer),
  public.settle_billing_operation(uuid, uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_billing_operation(uuid, uuid, uuid, text, text, text, jsonb, integer),
  public.settle_billing_operation(uuid, uuid, text, text, text, text) TO service_role;
COMMIT;
