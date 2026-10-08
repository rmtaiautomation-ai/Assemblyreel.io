-- DRAFT / UNAPPLIED. Requires add-billing-accounts.sql. Tables only: reservation
-- RPCs live in add-billing-usage-functions.sql and usage-windows.sql. Provider
-- integration and multi-connection staging tests remain pending.
BEGIN;

CREATE TABLE public.billing_usage_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.billing_accounts(id),
  subscription_id uuid,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL CHECK (window_end > window_start),
  metric text NOT NULL CHECK (metric IN ('projects', 'images', 'video_seconds',
    'narration_characters', 'transcription_seconds', 'llm_tokens', 'render_seconds', 'storage_bytes')),
  catalog_version text NOT NULL CHECK (length(btrim(catalog_version)) > 0),
  -- Quantities use integer units and stay exact when mapped to JS numbers.
  limit_quantity bigint NOT NULL CHECK (limit_quantity BETWEEN 0 AND 9007199254740991),
  used_quantity bigint NOT NULL DEFAULT 0 CHECK (used_quantity BETWEEN 0 AND 9007199254740991),
  reserved_quantity bigint NOT NULL DEFAULT 0 CHECK (reserved_quantity BETWEEN 0 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (subscription_id, account_id) REFERENCES public.billing_subscriptions(id, account_id),
  UNIQUE (account_id, window_start, metric),
  UNIQUE (id, account_id, metric),
  CHECK (used_quantity + reserved_quantity <= 9007199254740991)
  -- Do not constrain usage <= limit: a downgrade can legitimately exceed it.
);

CREATE TABLE public.billing_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.billing_accounts(id),
  -- Resource snapshot only, no destructive project-delete cascade. A future
  -- trusted creation RPC/service must verify resource/account ownership.
  resource_id uuid,
  operation_key text NOT NULL CHECK (length(operation_key) BETWEEN 8 AND 128),
  input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved', 'submitted', 'unknown', 'committed', 'released')),
  provider text,
  provider_request_id text,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  settled_at timestamptz,
  UNIQUE (account_id, operation_key),
  UNIQUE (id, account_id),
  CHECK ((state IN ('committed', 'released')) = (settled_at IS NOT NULL))
);

-- An operation can reserve several metrics atomically. Relational items retain
-- the original quantities and enforce matching operation/account/period/metric.
CREATE TABLE public.billing_operation_items (
  operation_id uuid NOT NULL,
  account_id uuid NOT NULL,
  usage_period_id uuid NOT NULL,
  metric text NOT NULL,
  quantity bigint NOT NULL CHECK (quantity BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY (operation_id, metric),
  FOREIGN KEY (operation_id, account_id) REFERENCES public.billing_operations(id, account_id),
  FOREIGN KEY (usage_period_id, account_id, metric)
    REFERENCES public.billing_usage_periods(id, account_id, metric)
);

CREATE INDEX billing_operation_recovery_queue ON public.billing_operations(state, updated_at)
  WHERE state IN ('reserved', 'submitted', 'unknown');
CREATE INDEX billing_items_by_period ON public.billing_operation_items(usage_period_id);

ALTER TABLE public.billing_usage_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_usage_periods FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_operation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_operation_items FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_usage_periods, public.billing_operations,
  public.billing_operation_items FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.billing_usage_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.billing_usage_periods TO service_role;
GRANT SELECT, INSERT ON public.billing_operations, public.billing_operation_items TO service_role;
GRANT UPDATE (state, provider, provider_request_id, last_error_code,
  updated_at, submitted_at, settled_at) ON public.billing_operations TO service_role;

CREATE POLICY billing_usage_owner_read ON public.billing_usage_periods
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.billing_accounts AS account
    WHERE account.id = account_id AND account.user_id = (SELECT auth.uid())
  ));
-- Operations, fingerprints, and reservation items remain server-private.
-- RPCs are separate service-only migrations; no browser write policy exists.
COMMIT;
