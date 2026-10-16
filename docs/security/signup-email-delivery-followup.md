# Public signup email delivery — follow-up

October 16, 2026 (Asia/Manila). Investigation identified a confirmed configuration blocker: the operator confirms the current sender is `onboarding@resend.dev` and no domain is owned yet. Resend's documented recipient restriction makes this sender unsuitable for arbitrary-recipient signup. The exact historical Auth log error remains unavailable; do not invent an observed 403 log. No SMTP setting, credential, domain record, account or email was changed or created by this investigation.

**Deferred by the owner, October 16:** continue building with the existing confirmed test accounts. Domain purchase, DNS verification and arbitrary-recipient signup/recovery delivery are launch-preparation tasks. This is not a request to disable confirmation or CAPTCHA. No paid service change is required for the current development work.

## Established evidence

- First-recipient signup/confirmation and recovery were previously accepted by the tester. Normal signup for the second recipient showed the generic registration failure and no account was found by the operator. That test identity was later provisioned with Supabase's per-user admin Create User flow. Admin provisioning does not accept the website signup/email flow.
- A fresh read-only GET of the selected project's public `/auth/v1/settings` returned `external.email=true`, `disable_signup=false`, `mailer_autoconfirm=false`. Email signup is enabled and confirmation is required. This endpoint does not expose the current private SMTP sender or provider failure logs.
- The application validates input/origin/CAPTCHA, calls Supabase `auth.signUp` with the fixed hosted confirmation callback, and gives visitors a generic error for unexpected provider failures. It separately reports rate-limit and CAPTCHA failures and never permits an accidental auto-confirmed signup session. No frontend-only change can remove an SMTP provider's recipient restriction.
- The operator confirmed `onboarding@resend.dev` as the shared sender. Resend explicitly restricts that domain to the Resend account's own email. It cannot deliver normal public confirmation emails to other addresses. This fits the observed recipient difference but the exact historical signup failure is not proven without its provider/Auth error.
- This session has no connected browser surface, Resend API credentials or Supabase management credentials for private SMTP/log inspection. The existing server credential was not used to export identities, sessions, SMTP passwords or confirmation links for this diagnosis.

## Next operator evidence

Items 1–2 below are now answered: current sender confirmed as the shared test sender; no domain/DNS access exists. Domain acquisition/choice is an external dependency, not an application code fix. No purchase or alternative-provider switch has been authorized. Keep public email delivery unaccepted until a chosen sender configuration is verified and tested.

1. Report only the sender email address shown in Supabase Authentication → Emails → SMTP Settings. Keep its password/API key private.
2. Confirm whether an owned domain and DNS access are available. The site may remain hosted at its existing Vercel URL; an email sending domain does not require moving web hosting.
3. In Supabase's Auth logs, inspect the failed signup event around the second-email attempt. Share only the provider error code/message, with tokens, credentials and delivered email links omitted. In Resend, SMTP-sent messages that were accepted for processing appear in the Emails table; absence there alone does not identify the failure. Resend does not expose general SMTP server debugging logs.

Do not repeatedly register the second email now: it already has an admin-created confirmed account. Do not delete that account to reproduce an old failure, disable confirmation/CAPTCHA or expose raw provider diagnostics publicly.

## Conditional repair for the shared test sender

If the sender is still `onboarding@resend.dev`, add an owned domain or dedicated sending subdomain in Resend and publish only the verification records Resend actually supplies. Never invent DNS values, replace unrelated DNS records or overwrite existing root MX/SPF records. Wait for the domain to be verified before changing the Supabase sender to an address on that exact verified domain.

For Resend custom SMTP, official settings are host `smtp.resend.com`, port 465 for implicit TLS (587 is STARTTLS), username `resend`, and the private Resend API key as password. A functioning existing key need not be rotated or copied into Vercel just to change sender identity. Credentials stay entered privately in Supabase.

If a verified domain/sender is already configured, investigate the actual error instead: key/domain permissions, sender mismatch, provider quota/suppression, SMTP configuration or Auth failure. Do not assume that every registration error is the shared-domain restriction.

## Acceptance after configuration

Use an explicitly selected new address controlled by the tester, once only, through the actual website with CAPTCHA. Verify the delivered confirmation reaches that address, the unconfirmed account cannot log in, its latest confirmation link works in the signup browser and the confirmed account reaches its own empty-account niche setup. Record the provider delivery result without sharing tokens or passwords. Recovery delivery to that address needs its own bounded test afterward. Existing first-account acceptance does not prove arbitrary-recipient delivery.

This is an external email-delivery dependency. Dashboard/workspace read/write isolation results remain valid; unrestricted public signup and public launch remain pending.

## Sources

- [Resend shared-domain restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
- [Resend SMTP settings and log availability](https://resend.com/docs/send-with-smtp)
- [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
