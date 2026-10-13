-- Read-only operator health summary. Counts only; no customer/event payloads.
select state,count(*) from public.generation_jobs group by state order by state;
select count(*) as expired_unsent_claims from public.generation_jobs where state='claimed' and provider_handle is null and lease_until<now();
select count(*) as uncertain_without_provider_handle from public.generation_jobs where state='unknown' and provider_handle is null;
select status,count(*) from public.billing_webhook_events group by status order by status;
select count(*) as receipts_exhausted from public.billing_webhook_events where attempts>=20 and status not in ('processed','ignored');
select state,count(*) from public.billing_checkout_attempts group by state order by state;
select count(*) as unknown_checkout_without_session from public.billing_checkout_attempts where state='unknown' and stripe_session_id is null;
select metric,sum(used_quantity) as used,sum(reserved_quantity) as reserved from public.billing_usage_periods
  where window_start<=now() and window_end>now() group by metric order by metric;
select singleton,paid_resource_limits from public.account_access_configuration;
