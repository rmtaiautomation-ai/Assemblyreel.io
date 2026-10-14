# Hosted password recovery continuation

October 14, 2026. Current origin: `https://assemblyreel-io.vercel.app`. Basic signup, confirmation, login/logout and valid-challenge CAPTCHA login passed for the single tester. Delivered recovery and password updates also passed: the user verified the old password fails and the new one works after logout. The native POST completion retest now passes in the hosted browser; broader rate/session/expiry acceptance remains in progress.

**Earlier CAPTCHA checkpoint:** the user reports the recovery redirect/template saved and Supabase CAPTCHA saved. The production Site Key, CAPTCHA requirement and private recovery secret were read back with exact matches after correcting CLI-added trailing newlines. Deployment `dpl_mT1u8z5HDHYPaxjEhaBrNt1PJzKC` from `b2d9563f89b3383edddff0e545cc0bb580bb84bd` reached Ready; the live client bundle contains the exact public key and Turnstile script. Direct-provider login probes with missing and invalid challenges both returned `captcha_failed` with no session. The subsequent login, rate-limit and activation results are recorded below.

**Controlled recovery activation:** the user subsequently verified CAPTCHA login reaches their confirmed account. Their dashboard screenshot shows 30 project emails/hour, 30 sign-up/sign-in requests per five minutes/IP, 30 verification requests per five minutes/IP, and 150 refresh requests per five minutes/IP. Enabled `AUTH_ABUSE_CONTROLS_READY` and `AUTH_RECOVERY_ENABLED` for the existing single-tester auth-only deployment; exact environment read-back matches. The configured limits and CAPTCHA checks justify testing the gated recovery flow, but do not establish complete abuse-control/customer acceptance. Real request-limit behavior is being tested with only two recovery requests.

Deployment `dpl_7PoaJAwPDHfH9VfoX7REEYMW1DqN` from `3c6a8d35b5b7af57cba1a0429ba8f8067261e016` reached Ready and serves the exact configured hostname. HTTP checks confirmed enabled/private recovery, signed-out reset rejection and closed email-change/content/billing boundaries. The compact widget fits narrow auth cards; real mobile usability remains pending. Email changes, ownership, onboarding, generation and billing remain disabled.

**Recovery browser result:** the tester received the recovery email, opened its link, entered a new password, and reached the account page rather than the intended login page. After explicit logout, the old password was rejected and the new password opened the account. This accepts delivered recovery and the credential update, while identifying a completion-navigation issue. The second-request rate-limit case was not performed, so no live 429 result is claimed.

Prepared a completion fix: successful recovery returns a completion state only after global sign-out succeeds, then the reset form makes a full document navigation to login. Login shows a fixed password-updated message. A real SSR SDK fixture verifies proof consumption and base/chunked cookie removal before success; a sign-out failure reports uncertainty and does not trigger successful completion. These tests do not establish the exact cause of the original browser navigation. Hosted completion retest and other-session revocation remain pending.

Validation before publishing the completion fix: **49 auth tests**, auth lint and production build/TypeScript passed. No credentials, delivered links or session tokens were collected from the tester.

**Completion retest and replacement:** the user reports that the `72f0377` completion change still ends at Account, so that change is not accepted as a browser fix. They also confirmed that reopening the used recovery link is rejected; controlled expiry remains untested. Replaced the reset form's Server Action/client-effect navigation with a native, same-origin POST to `/api/auth/reset-password`. The handler retains verified recovery proof, password validation and global sign-out, then sends a private HTTP 303 to the fixed Login notice. Update failure returns to the guarded reset form; revocation failure reports uncertainty without announcing successful sign-out. This avoids depending on a page rerender/client effect after the proof and session cookies change; the original hosted cause remains unproven.

Validation for the replacement: **51 auth tests**, auth/access lint and production build/TypeScript passed. A local Next.js HTTP fixture with a synthetic loopback provider verified rendered native form submission, actual 303 response and `Set-Cookie` removal for base/chunked sessions, Login success text, subsequent Account rejection and cross-origin rejection before mutation. No real passwords or email requests were used. A fresh hosted browser completion test is still required after deployment.

**Hosted completion accepted:** deployment `dpl_6MTbAoQc9Gqiivjg5ExdK3rF7d8F` from `1637bbcc1bf2e68b22daa47177bfc20757c50e7e` reached Ready at the configured hostname. Seven live HTTP checks passed for the Login notice/private headers, enabled recovery, deployed native POST, foreign-origin rejection, missing-proof rejection and signed-out reset protection. The tester then confirmed a fresh recovery ends at Login with the password-updated notice, and the new password opens Account. This resolves the reported completion issue for the tester. Reused-link rejection also passed; actual request-limit response, controlled expiry and other-device refresh-session revocation remain unverified. No new credentials or delivered links were collected.

**Independent continuation:** 53 auth tests and auth lint passed, including actual SSR SDK recovery responses for 429, CAPTCHA forwarding and account-existence masking. The repeatable `npm run test:auth:http` passed 11 local Next.js HTTP scenarios covering missing/expired/unrelated proof, provider expiry, renewal, reset completion and rejected revoked refresh sessions. Seven live endpoint checks and read-only legacy preservation checks passed again after the tester's accepted reset. Runtime application code/configuration is unchanged. These synthetic-provider results do not accept real browser Back or live provider timing. Follow the [return checklist](account-security-return-checklist.md) for the remaining private tests.

## Turnstile configuration

The Vercel URL is a public website hostname. A Cloudflare Turnstile account supplies the CAPTCHA widget only; GitHub, Vercel hosting and DNS do not need to move.

1. Create a Cloudflare account and open **Turnstile → Add widget**. Name it AssemblyReel, add hostname `assemblyreel-io.vercel.app`, and select Managed mode.
2. Give the agent only its public Site Key. Keep the Secret Key private. The agent sets `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `AUTH_CAPTCHA_REQUIRED=true` in Vercel and deploys the matching forms before Supabase CAPTCHA is enabled.
3. After that deployment is verified, open Supabase **Authentication → Attack Protection** (the CAPTCHA/Bot and Abuse Protection section). Select Turnstile, enter its Secret Key privately, enable CAPTCHA and save.
4. Verify real login with a completed challenge and direct-provider rejection of missing/invalid challenges. Inspect Auth rate limits before controlled recovery activation. During acceptance, verify a second recovery request within 60 seconds receives the provider's wait response. Record observed limits without repeatedly flooding login or recovery endpoints.

References: [Cloudflare widget setup](https://developers.cloudflare.com/turnstile/get-started/), [Supabase CAPTCHA configuration](https://supabase.com/docs/guides/auth/auth-captcha).

## Recovery email configuration

In Supabase **Authentication → URL Configuration**, add the exact redirect `https://assemblyreel-io.vercel.app/auth/recovery`. In **Emails → Reset password → Source**, use:

```html
<h2>Reset your AssemblyReel password</h2>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery">Reset password</a></p>
```

This route intentionally requires a recovery token hash; the default signup template may continue using `{{ .ConfirmationURL }}`. The callback accepts Supabase's optional `pkce_` hash prefix, verifies the recovery identity and session, and issues a private ten-minute proof before password updates are allowed.

After CAPTCHA login/rejection and rate-limit configuration are verified, the agent configures a private server-only `AUTH_RECOVERY_SECRET` and enables `AUTH_ABUSE_CONTROLS_READY` and `AUTH_RECOVERY_ENABLED` for controlled testing. Verify actual rate-limit behavior, delivered recovery, password updates, old/new credentials, reused links and refresh-session behavior before accepting the phase. Passwords and delivered links stay private.

## Separate email-change availability

`AUTH_EMAIL_CHANGE_ENABLED` defaults to false independently of password recovery. The current Resend shared sender delivers only to its account email, so a change to another address cannot yet complete its two-inbox confirmation. Enable this control only after a verified sender can deliver to both addresses, secure email change remains enabled in Supabase, and its matching callback/template and profile synchronization are tested. Password recovery can be accepted for the current address first.

## Database isolation check

The complete [auth isolation SQL](../../db/auth/existing-project/test-auth-isolation.sql) was run by the user as postgres in the existing Supabase SQL Editor and returned its expected PASS result on October 14, 2026. It checked two synthetic identities, A/B profile isolation, blocked anonymous access and closed legacy content/storage, then rolled back every inserted row without sending mail or creating sessions. Follow-up read-only checks confirmed exactly one real confirmed account and one matching zero-credit profile, all eight legacy content table hashes unchanged, and all three buckets private. Both local execution and live role isolation passed. Two independent real browser accounts remain untested.

Remaining browser checks include Back after logout, token-expiry renewal, mobile/keyboard form usability, and controlled expired/reused confirmation links. Ownership/onboarding activation requires a fresh schema-specific migration review because legacy scenes store project IDs as text and include orphan rows; do not replay the completed auth upgrade or apply the generic ownership drafts directly.
