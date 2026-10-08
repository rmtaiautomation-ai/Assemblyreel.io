-- DRAFT / UNAPPLIED. Requires accounts and usage tables.
-- Caller derives the current monthly window from a verified Stripe cycle and
-- an approved catalog. There is no browser-controlled limit/window API.
BEGIN;
CREATE FUNCTION public.sync_billing_usage_window(
  p_account_id uuid, p_subscription_id uuid, p_window_start timestamptz,
  p_window_end timestamptz, p_catalog_version text, p_limits jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public SET timezone = 'UTC' AS $$
DECLARE
  subscription public.billing_subscriptions%ROWTYPE;
  checked_metric text;
  limit_value jsonb;
  checked_at timestamptz;
BEGIN
  IF p_limits IS NULL OR jsonb_typeof(p_limits) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLAN_NOT_CONFIGURED';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_limits)) <> 8 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLAN_NOT_CONFIGURED';
  END IF;
  FOR checked_metric, limit_value IN SELECT key, value FROM jsonb_each(p_limits) LOOP
    IF checked_metric NOT IN ('projects', 'images', 'video_seconds', 'narration_characters',
      'transcription_seconds', 'llm_tokens', 'render_seconds', 'storage_bytes')
      OR jsonb_typeof(limit_value) <> 'number' OR limit_value::text !~ '^(0|[1-9][0-9]{0,15})$' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLAN_NOT_CONFIGURED';
    END IF;
    IF limit_value::text::numeric > 9007199254740991 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLAN_NOT_CONFIGURED';
    END IF;
  END LOOP;
  PERFORM 1 FROM public.billing_accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OWNERSHIP_REQUIRED';
  END IF;
  SELECT * INTO subscription FROM public.billing_subscriptions
    WHERE id = p_subscription_id AND account_id = p_account_id AND is_current FOR UPDATE;
  checked_at := clock_timestamp();
  IF NOT FOUND OR subscription.status <> 'active' OR subscription.pause_collection
    OR subscription.catalog_version IS DISTINCT FROM p_catalog_version OR subscription.plan_id IS NULL
    OR subscription.verified_at IS NULL OR subscription.verified_at > checked_at
    OR subscription.current_period_start IS NULL OR subscription.current_period_end IS NULL
    OR subscription.access_starts_at IS NULL OR subscription.access_expires_at IS NULL
    OR p_window_start IS NULL OR p_window_end IS NULL OR p_window_start >= p_window_end
    OR p_window_start > checked_at OR p_window_end <= checked_at
    OR p_window_start < subscription.current_period_start OR p_window_end > subscription.current_period_end
    OR p_window_start < subscription.access_starts_at OR p_window_end > subscription.access_expires_at
    OR p_window_end > p_window_start + interval '31 days' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_SYNC_PENDING';
  END IF;
  -- Different anchors overlapping the existing window must not grant a fresh
  -- bucket after a mid-cycle change. Such migrations need explicit carry-over.
  IF EXISTS (SELECT 1 FROM public.billing_usage_periods AS period
    WHERE period.account_id = p_account_id AND period.window_start <> p_window_start
    AND period.window_start < p_window_end AND period.window_end > p_window_start) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_SYNC_PENDING';
  END IF;
  INSERT INTO public.billing_usage_periods(account_id, subscription_id, window_start, window_end,
    metric, catalog_version, limit_quantity)
    SELECT p_account_id, p_subscription_id, p_window_start, p_window_end,
      key, p_catalog_version, value::text::bigint FROM jsonb_each(p_limits)
    ON CONFLICT (account_id, window_start, metric) DO UPDATE SET
      subscription_id = EXCLUDED.subscription_id, window_end = EXCLUDED.window_end,
      catalog_version = EXCLUDED.catalog_version, limit_quantity = EXCLUDED.limit_quantity, updated_at = checked_at;
  -- Existing used/reserved counters are deliberately NEVER overwritten.
END;
$$;
REVOKE ALL ON FUNCTION public.sync_billing_usage_window(uuid, uuid, timestamptz, timestamptz, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_billing_usage_window(uuid, uuid, timestamptz, timestamptz, text, jsonb) TO service_role;
COMMIT;
