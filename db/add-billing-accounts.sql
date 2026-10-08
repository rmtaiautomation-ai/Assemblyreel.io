-- DRAFT / UNAPPLIED: plan 25 foundation. Review and test in isolated staging
-- before activation. No backfill, auth trigger change, or product-data rewrite.
-- Intentionally fail if a table already exists: do not silently accept an
-- unknown schema/policy layout. Apply once as the database migration owner.
BEGIN;

CREATE TABLE public.billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Preserve accounting records on auth deletion; retention/anonymization must
  -- be approved before deployment. An orphan account is not browser-readable.
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT false,
  stripe_mode text NOT NULL CHECK (stripe_mode IN ('test', 'live')),
  stripe_customer_id text CHECK (stripe_customer_id IS NULL OR length(btrim(stripe_customer_id)) > 0),
  trial_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, stripe_mode),
  UNIQUE (stripe_mode, stripe_customer_id)
);

CREATE TABLE public.billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  stripe_mode text NOT NULL CHECK (stripe_mode IN ('test', 'live')),
  stripe_subscription_id text NOT NULL CHECK (length(btrim(stripe_subscription_id)) > 0),
  stripe_price_id text NOT NULL CHECK (length(btrim(stripe_price_id)) > 0),
  plan_id text CHECK (plan_id IN ('creator', 'pro', 'studio')),
  catalog_version text CHECK (catalog_version IS NULL OR length(btrim(catalog_version)) > 0),
  status text NOT NULL CHECK (status IN ('trialing', 'active', 'incomplete',
    'incomplete_expired', 'past_due', 'canceled', 'unpaid', 'paused')),
  billing_interval text NOT NULL CHECK (billing_interval IN ('month', 'year')),
  is_current boolean NOT NULL DEFAULT false,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  pause_collection boolean NOT NULL DEFAULT false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  access_starts_at timestamptz,
  access_expires_at timestamptz,
  trial_ends_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, stripe_mode) REFERENCES public.billing_accounts(id, stripe_mode),
  UNIQUE (stripe_mode, stripe_subscription_id),
  UNIQUE (id, account_id),
  CHECK ((current_period_start IS NULL AND current_period_end IS NULL)
    OR (current_period_start IS NOT NULL AND current_period_end IS NOT NULL
      AND current_period_end > current_period_start)),
  CHECK ((access_starts_at IS NULL AND access_expires_at IS NULL)
    OR (access_starts_at IS NOT NULL AND access_expires_at IS NOT NULL
      AND access_expires_at > access_starts_at))
);

CREATE UNIQUE INDEX billing_one_current_subscription
  ON public.billing_subscriptions(account_id) WHERE is_current;

CREATE TABLE public.billing_webhook_events (
  stripe_mode text NOT NULL CHECK (stripe_mode IN ('test', 'live')),
  stripe_event_id text NOT NULL CHECK (length(btrim(stripe_event_id)) > 0),
  event_type text NOT NULL CHECK (length(btrim(event_type)) > 0),
  account_id uuid,
  object_id text,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'processed', 'failed', 'ignored')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code text,
  received_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (stripe_mode, stripe_event_id),
  FOREIGN KEY (account_id, stripe_mode) REFERENCES public.billing_accounts(id, stripe_mode),
  CHECK ((status IN ('processed', 'ignored')) = (completed_at IS NOT NULL))
);

CREATE INDEX billing_webhook_retry_queue
  ON public.billing_webhook_events(status, received_at)
  WHERE status IN ('received', 'processing', 'failed');

ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_webhook_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_accounts, public.billing_subscriptions,
  public.billing_webhook_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.billing_accounts, public.billing_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.billing_accounts, public.billing_subscriptions,
  public.billing_webhook_events TO service_role;

CREATE POLICY billing_account_owner_read ON public.billing_accounts
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY billing_subscription_owner_read ON public.billing_subscriptions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.billing_accounts AS account
    WHERE account.id = account_id AND account.user_id = (SELECT auth.uid())
  ));
-- No browser write policies and no browser webhook visibility. Verify the
-- standard Supabase service_role BYPASSRLS property before deployment.
COMMIT;
