# Hosted password recovery continuation

October 14, 2026. Current origin: `https://assemblyreel-io.vercel.app`. Basic signup, confirmation, login and logout passed for the single tester. Password recovery remains disabled until the following provider configuration is verified.

**Current checkpoint:** the user reports the recovery redirect/template saved and Supabase CAPTCHA saved. The production Site Key, CAPTCHA requirement and private recovery secret were read back with exact matches after correcting CLI-added trailing newlines. Deployment `dpl_mT1u8z5HDHYPaxjEhaBrNt1PJzKC` from `b2d9563f89b3383edddff0e545cc0bb580bb84bd` reached Ready; the live client bundle contains the exact public key and Turnstile script. Direct-provider login probes with missing and invalid challenges both returned `captcha_failed` with no session. Valid-challenge browser login, rate-limit settings and real recovery acceptance are still pending.

## Turnstile configuration

The Vercel URL is a public website hostname. A Cloudflare Turnstile account supplies the CAPTCHA widget only; GitHub, Vercel hosting and DNS do not need to move.

1. Create a Cloudflare account and open **Turnstile → Add widget**. Name it AssemblyReel, add hostname `assemblyreel-io.vercel.app`, and select Managed mode.
2. Give the agent only its public Site Key. Keep the Secret Key private. The agent sets `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `AUTH_CAPTCHA_REQUIRED=true` in Vercel and deploys the matching forms before Supabase CAPTCHA is enabled.
3. After that deployment is verified, open Supabase **Authentication → Attack Protection** (the CAPTCHA/Bot and Abuse Protection section). Select Turnstile, enter its Secret Key privately, enable CAPTCHA and save.
4. Verify real login with a completed challenge and direct-provider rejection of missing/invalid challenges. Inspect Auth rate limits and verify a repeated resend receives the provider's wait response. Record observed limits without repeatedly flooding login or recovery endpoints.

References: [Cloudflare widget setup](https://developers.cloudflare.com/turnstile/get-started/), [Supabase CAPTCHA configuration](https://supabase.com/docs/guides/auth/auth-captcha).

## Recovery email configuration

In Supabase **Authentication → URL Configuration**, add the exact redirect `https://assemblyreel-io.vercel.app/auth/recovery`. In **Emails → Reset password → Source**, use:

```html
<h2>Reset your AssemblyReel password</h2>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery">Reset password</a></p>
```

This route intentionally requires a recovery token hash; the default signup template may continue using `{{ .ConfirmationURL }}`. The callback accepts Supabase's optional `pkce_` hash prefix, verifies the recovery identity and session, and issues a private ten-minute proof before password updates are allowed.

After provider settings pass, the agent generates a server-only `AUTH_RECOVERY_SECRET`, configures it privately in Vercel, and enables `AUTH_ABUSE_CONTROLS_READY` and `AUTH_RECOVERY_ENABLED`. The tester then requests one recovery email, changes their password, confirms the old password fails and the new password works, and checks reused-link and refresh-session behavior. Passwords and delivered links stay private.

## Separate email-change availability

`AUTH_EMAIL_CHANGE_ENABLED` defaults to false independently of password recovery. The current Resend shared sender delivers only to its account email, so a change to another address cannot yet complete its two-inbox confirmation. Enable this control only after a verified sender can deliver to both addresses, secure email change remains enabled in Supabase, and its matching callback/template and profile synchronization are tested. Password recovery can be accepted for the current address first.

## Database isolation check

Run the complete [auth isolation SQL](../../db/auth/existing-project/test-auth-isolation.sql) as postgres in the existing Supabase SQL Editor. It provisions two synthetic identities inside one transaction, checks A/B profile isolation, blocked anonymous access and closed legacy content/storage, then rolls back every inserted row. It does not send mail or create login sessions. Local PGlite execution passed; live execution is still pending. This is database-role evidence, not acceptance of two independent browser accounts.

Remaining browser checks include Back after logout, token-expiry renewal, mobile/keyboard form usability, and controlled expired/reused confirmation links. Ownership/onboarding activation requires a fresh schema-specific migration review because legacy scenes store project IDs as text and include orphan rows; do not replay the completed auth upgrade or apply the generic ownership drafts directly.
