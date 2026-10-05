# Monetization & Subscription System — Implementation Plan

> **Plan number:** 25
> **Status:** Not started
> **Created:** 2026-10-02
> **Depends on:** Supabase auth (already live), Stripe SDK (already installed), existing skeleton routes

---

## Background & Current State

### What exists today

| Component | Status | File(s) |
|---|---|---|
| Landing page (`/`) | ✅ Live, has login modal, links to `/pricing` | [page.tsx](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/page.tsx) |
| Pricing page (`/pricing`) | ✅ Live, 4 tiers (Free/$19/$39/$69), buttons do nothing | [pricing/page.tsx](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/pricing/page.tsx) |
| Billing page (`/billing`) | ✅ Live, all mock data, Stripe portal redirect wired | [billing/page.tsx](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/(dashboard)/billing/page.tsx) |
| Stripe server lib | ✅ Initialized | [stripe-server.ts](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/lib/stripe-server.ts) |
| Checkout API route | ✅ Working but untested with real keys | [stripe/checkout/route.ts](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/api/stripe/checkout/route.ts) |
| Webhook API route | ✅ Skeleton — handles `checkout.session.completed`, `subscription.updated/deleted` | [stripe/webhook/route.ts](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/api/stripe/webhook/route.ts) |
| Portal API route | ✅ Redirects to Stripe Billing Portal | [stripe/portal/route.ts](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/api/stripe/portal/route.ts) |
| DB stripe schema | ✅ Migration file exists, adds `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `motion_credits` to `profiles` | [stripe-schema.sql](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/db/stripe-schema.sql) |
| Auth middleware | ❌ No middleware.ts exists — routes are unprotected | — |
| Subscription gating | ❌ Nothing prevents a free user from using the full app | — |

### What's wrong with the current pricing page

The current tiers are:
- **Free** ($0) — "Temporarily paused" button
- **Starter** ($19/mo) — 3 posts/week, 27 motion credits
- **Daily** ($39/mo) — 1 post/day, 62 motion credits
- **Hardcore** ($69/mo) — 2 posts/day, 124 motion credits

Problems:
1. Tier names are weak ("Hardcore" is not a professional SaaS tier name).
2. Differentiation is only by posting frequency — missing key axes: channels, video length, cloud render, voice cloning.
3. Pricing is too low for the API costs this pipeline burns per video.
4. The Monthly/Yearly toggle doesn't work.
5. "TRY NOW!" buttons are dead.
6. FAQ answers are missing (just titles with no expand).

---

## Plan Overview

| Phase | What | Target Date |
|---|---|---|
| **1** | DB schema — extend `profiles` with plan tier + usage tracking | Day 1 |
| **2** | Stripe Dashboard setup — create Products & Prices | Day 1 |
| **3** | Shared plan config — single source of truth for tier limits | Day 2 |
| **4** | Pricing page redesign — 4 tiers, working toggle, Stripe checkout | Day 2–3 |
| **5** | Landing page update — align hero + pricing section | Day 3 |
| **6** | Auth middleware + subscription gate | Day 4 |
| **7** | Onboarding flow — signup → demo → upgrade prompt | Day 5–6 |
| **8** | Billing dashboard — wire to real Supabase/Stripe data | Day 6 |
| **9** | Usage metering — enforce limits in generation actions | Day 7–8 |
| **10** | Webhook hardening + verification | Day 8 |

---

## Phase 1 — Database schema extension

> Extend the `profiles` table (or the `users` table if that's the one Supabase auth triggers populate) with plan-tier metadata and usage counters.

#### [CREATE] `db/add-subscription-tiers.sql`

```sql
-- Plan tier tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_tier text DEFAULT 'trial';
-- Valid values: 'trial', 'creator', 'pro', 'studio', 'enterprise'

-- Stripe price ID the user is subscribed to (for lookup on webhook)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_price_id text;

-- Trial tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Monthly usage counters (reset by a cron or on billing cycle)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS videos_used_this_month integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS images_used_this_month integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS usage_reset_at timestamptz DEFAULT now();

-- Billing interval for display
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_interval text DEFAULT 'monthly';
-- Valid: 'monthly', 'yearly'
```

> [!NOTE]
> This extends the existing `stripe-schema.sql` additions. If `profiles` doesn't exist yet, we create it in the same migration. Check whether the app uses `users` or `profiles` — the checkout route references `profiles`, so we follow that.

### Verification
- Run migration against Supabase.
- Query back: `SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles';` — confirm all new columns present.

---

## Phase 2 — Stripe Dashboard product setup

> This is a manual step (not code). Create the products and prices in the Stripe dashboard.

#### Create ONE Stripe Product: "AssemblyReel Subscription"

Then create **6 Prices** on it (monthly + yearly for each tier):

| Tier | Monthly Price | Annual Price (per year) | Stripe Lookup Key |
|---|---|---|---|
| Creator | $49/mo | $420/yr ($35/mo) | `creator_monthly` / `creator_yearly` |
| Pro | $99/mo | $864/yr ($72/mo) | `pro_monthly` / `pro_yearly` |
| Studio | $249/mo | $2,148/yr ($179/mo) | `studio_monthly` / `studio_yearly` |
| Enterprise | Custom | Custom | — (sales-led, no self-serve checkout) |

> [!IMPORTANT]
> Use Stripe **lookup_keys** (not hardcoded price IDs) so we can update prices without redeploying code. The checkout route will resolve by lookup key.

#### Add to `.env.local`:
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_SITE_URL=https://assemblyreel.io
```

### Verification
- In Stripe Dashboard → Products → confirm 1 product, 6 active prices with correct lookup keys.

---

## Phase 3 — Shared plan configuration

> A single TypeScript file that is the **only** place plan limits are defined — used by the pricing page, the billing page, the middleware, and the generation actions.

#### [CREATE] `src/lib/plans.ts`

```ts
export type PlanTier = 'trial' | 'creator' | 'pro' | 'studio' | 'enterprise';

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  monthlyPrice: number;        // in dollars, 0 for trial
  yearlyMonthlyPrice: number;  // effective monthly when billed yearly
  stripeLookupKeys: { monthly: string; yearly: string } | null;
  limits: {
    channels: number;           // max workspaces
    videosPerMonth: number;     // max video_projects created per billing cycle
    maxActsPerVideo: number;    // acts cap
    imagesPerMonth: number;     // Gemini image gen cap
    videoClipsPerMonth: number; // Fal.ai video gen cap
    cloudRender: boolean;       // Lambda render access
    voiceCloning: boolean;      // ElevenLabs clone access
    seats: number;              // team members
  };
  badge?: string;               // e.g. "Most Popular"
}

export const PLANS: Record<PlanTier, PlanConfig> = {
  trial: { /* 7-day trial, 1 channel, 1 video, 3 acts, no cloud render */ },
  creator: { /* $49/mo, 1 channel, 4 videos, 5 acts, local render only */ },
  pro: { /* $99/mo, 3 channels, 15 videos, 10 acts, local only, voice clone */ },
  studio: { /* $249/mo, 10 channels, 50 videos, unlimited acts, Lambda, 3 seats */ },
  enterprise: { /* custom, unlimited everything */ },
};

export function getPlanByLookupKey(key: string): PlanConfig | undefined { ... }
export function getPlanByTier(tier: PlanTier): PlanConfig { ... }
```

### Verification
- `tsc` — no errors.
- Import from pricing page and billing page — both render correct data.

---

## Phase 4 — Pricing page redesign

> Rebuild `/pricing` with the 4-tier structure, working monthly/yearly toggle, and live Stripe Checkout integration.

#### [MODIFY] [pricing/page.tsx](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/pricing/page.tsx)

**Changes:**
1. **Replace the 4 hardcoded tier cards** with a `PLANS` map render (from `src/lib/plans.ts`).
2. **Wire the Monthly/Yearly toggle** — `useState<'monthly' | 'yearly'>` controls which price is displayed and which `stripeLookupKey` is sent to checkout.
3. **Wire "Get Started" buttons** — call `POST /api/stripe/checkout` with the lookup key. If user is not logged in, redirect to signup first.
4. **Tier names:** Creator (entry), Pro (popular, highlighted), Studio (agency), Enterprise (custom, "Contact Sales" button).
5. **Feature comparison table** below the cards — channels, videos/mo, acts, render destination, voice cloning, seats.
6. **Fix FAQ section** — wire the expand/collapse with `useState` for each question, and provide actual answer text.
7. **Keep the same visual style** (blue accent, rounded cards, green check marks) but use the dark app theme tokens where applicable.

#### [MODIFY] [stripe/checkout/route.ts](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/api/stripe/checkout/route.ts)

**Changes:**
- Accept `lookupKey` instead of (or in addition to) `priceId`.
- Resolve price ID via `stripe.prices.list({ lookup_keys: [lookupKey] })`.
- Add `subscription_data.trial_period_days: 7` for new customers (first subscription only).
- Set `subscription_data.metadata` with `plan_tier` so the webhook can read it.

### Verification
- Visit `/pricing` — 4 cards render with correct prices.
- Toggle monthly/yearly — prices update.
- Click "Get Started" on Creator → redirects to Stripe Checkout (test mode).
- Complete checkout → redirects back to `/workspaces?session_id=...`.

---

## Phase 5 — Landing page update

> Align the landing page with the new plan structure. The existing page is good — we just update the pricing references.

#### [MODIFY] [page.tsx (landing)](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/page.tsx)

**Changes:**
1. Update hero subtext — "No credit card required" → "7-day free trial • No commitment" (matches the reverse trial model).
2. Update "See Plans & Pricing" link — already points to `/pricing`, just confirm.
3. **Add a mini pricing section** on the landing page itself (3-card summary of Creator/Pro/Studio) below the existing feature sections. Link "See full comparison" to `/pricing`.
4. Update the login modal to route to Supabase auth instead of the demo cookie.

### Verification
- Visit `/` — landing page renders, pricing mini-section visible.
- Click "Start Creating Free" → shows auth modal (Supabase).
- Click "See Plans & Pricing" → goes to `/pricing`.

---

## Phase 6 — Auth middleware + subscription gate

> Add Next.js middleware to protect dashboard routes and enforce subscription status.

#### [CREATE] `src/middleware.ts`

**Logic:**
```
Request comes in:
  1. PUBLIC routes (/, /pricing, /api/stripe/webhook) → pass through
  2. ALL OTHER routes → check Supabase session
     a. No session → redirect to /
     b. Session exists, plan_tier = 'trial', trial_ends_at < now() → redirect to /pricing?expired=true
     c. Session exists, subscription_status not in ['active', 'trialing'] → redirect to /pricing?upgrade=true
     d. Otherwise → pass through
```

#### [CREATE] `src/lib/supabase/middleware.ts`
- Helper to create Supabase client in middleware context and read session + profile.

#### [MODIFY] [dashboard layout.tsx](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/(dashboard)/layout.tsx)
- Read the user's `plan_tier` from Supabase and show it in the sidebar (badge next to user name).
- Show "Upgrade" link if on trial or creator tier.

### Verification
- Logged out → visit `/workspaces` → redirected to `/`.
- Logged in, no subscription → redirected to `/pricing?upgrade=true`.
- Logged in, active subscription → dashboard loads.
- Logged in, expired trial → redirected to `/pricing?expired=true`.

---

## Phase 7 — Onboarding flow

> The first-time user experience after signup.

#### [CREATE] `src/app/onboarding/page.tsx`

**Multi-step wizard:**
1. **Welcome** — "Let's set up your first channel" (name, niche picker).
2. **Channel Blueprint basics** — voice style, visual aesthetic (re-use ChannelFormatSection fields).
3. **Demo generation** — auto-create a 2-act project with watermark. Show a "Generating…" state, then the timeline preview.
4. **Upgrade prompt** — "You just created your first video. Unlock unlimited creation." → CTA to `/pricing`.

#### [MODIFY] Checkout success handling
- After Stripe checkout success, redirect to `/workspaces` (already configured in checkout route).
- On first load of `/workspaces` after checkout, show a confetti/success toast: "Welcome to [Plan Name]!"

#### Routing logic
- After signup (Supabase `auth.signUp`), check if user has any workspaces.
  - 0 workspaces → redirect to `/onboarding`.
  - 1 or more workspaces → redirect to `/workspaces`.

### Verification
- New user signs up → lands on `/onboarding` step 1.
- Completes setup → demo video generates (mock or real with 2-act cap).
- Clicks "Upgrade" → goes to `/pricing`, selects plan, completes checkout.
- Redirected to `/workspaces` with success state.

---

## Phase 8 — Billing dashboard — wire to real data

> Replace all mock data in the billing page with actual Supabase/Stripe reads.

#### [MODIFY] [billing/page.tsx](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/(dashboard)/billing/page.tsx)

**Changes:**
1. Convert to async Server Component (or use a server action to fetch data).
2. Read `profiles` row: `plan_tier`, `subscription_status`, `stripe_subscription_id`, `videos_used_this_month`, `motion_credits`, `usage_reset_at`.
3. Read plan config from `PLANS[profile.plan_tier]` for limits display.
4. Fetch invoices from Stripe: `stripe.invoices.list({ customer: profile.stripe_customer_id, limit: 10 })`.
5. Calculate credit/usage percentage from real data.
6. "Manage Billing" button already calls `/api/stripe/portal` — just verify it works end-to-end.

### Verification
- Active subscriber visits `/billing` — sees real plan name, real usage, real invoices.
- Trial user visits `/billing` — sees "Trial" badge, days remaining, upgrade CTA.

---

## Phase 9 — Usage metering + enforcement

> Prevent users from exceeding their plan limits. This is the revenue-protection layer.

#### [CREATE] `src/lib/usage.ts`

```ts
export async function checkUsageLimit(
  userId: string,
  resource: 'video' | 'image' | 'videoClip'
): Promise<{ allowed: boolean; used: number; limit: number; remaining: number }>;

export async function incrementUsage(
  userId: string,
  resource: 'video' | 'image' | 'videoClip'
): Promise<void>;
```

#### [MODIFY] `src/app/actions/video-actions.ts` → `createProjectWithActs`
- Before creating a project, call `checkUsageLimit(userId, 'video')`.
- If `!allowed`, throw a user-facing error: "You've reached your monthly video limit (X/Y). Upgrade your plan to create more."
- After creation succeeds, call `incrementUsage(userId, 'video')`.

#### [MODIFY] `src/lib/ai/providers/gemini-image.ts`
- Before generating, check `checkUsageLimit(userId, 'image')`.

#### [MODIFY] Workspace creation (wherever `workspaces.insert` happens)
- Count existing workspaces for the user.
- If `count >= PLANS[plan_tier].limits.channels`, block with: "Your plan supports up to X channels. Upgrade to add more."

#### Usage reset
- Option A: Supabase cron function that resets `videos_used_this_month` to 0 on the 1st of each month.
- Option B: Check `usage_reset_at` on every `checkUsageLimit` call; if it's past the billing cycle boundary, reset inline.
- **Recommend Option B** — no extra infra, self-healing.

### Verification
- Create a user on Creator plan (4 videos/mo limit).
- Create 4 videos → succeed.
- Attempt 5th video → blocked with upgrade message.
- Create a workspace when at channel limit → blocked.

---

## Phase 10 — Webhook hardening + end-to-end verification

> Make the webhook handler production-grade.

#### [MODIFY] [stripe/webhook/route.ts](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/api/stripe/webhook/route.ts)

**Changes:**
1. On `checkout.session.completed`:
   - Read `plan_tier` from session metadata.
   - Set `profiles.plan_tier`, `profiles.billing_interval`, `profiles.stripe_price_id`.
   - Set `profiles.trial_started_at` and `profiles.trial_ends_at` if trial was used.
   - Reset `videos_used_this_month` to 0 (new billing cycle).

2. On `customer.subscription.updated`:
   - If status changed to `active` from `trialing` → update `plan_tier` (trial converted).
   - If plan changed (upgrade/downgrade) → update `plan_tier`, `stripe_price_id`, and reset usage counters.

3. On `customer.subscription.deleted`:
   - Set `plan_tier = 'trial'`, `subscription_status = 'canceled'`.
   - Do NOT delete user data — they may re-subscribe.

4. On `invoice.payment_failed`:
   - Set `subscription_status = 'past_due'`.
   - (Future: trigger email notification.)

5. Add **idempotency**: check `event.id` against a processed-events cache or just rely on Stripe's built-in deduplication.

### Verification

Full end-to-end test using Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
```

- After `checkout.session.completed` → `profiles` row updated with correct tier.
- After `subscription.deleted` → user redirected to pricing on next page load.
- After `invoice.payment_failed` → user sees "payment issue" banner on dashboard.

---

## File Summary

### New files to create (6)
| File | Phase |
|---|---|
| `db/add-subscription-tiers.sql` | 1 |
| `src/lib/plans.ts` | 3 |
| `src/middleware.ts` | 6 |
| `src/lib/supabase/middleware.ts` | 6 |
| `src/app/onboarding/page.tsx` | 7 |
| `src/lib/usage.ts` | 9 |

### Existing files to modify (8)
| File | Phase |
|---|---|
| [pricing/page.tsx](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/pricing/page.tsx) | 4 |
| [stripe/checkout/route.ts](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/api/stripe/checkout/route.ts) | 4 |
| [page.tsx (landing)](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/page.tsx) | 5 |
| [layout.tsx (dashboard)](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/(dashboard)/layout.tsx) | 6 |
| [billing/page.tsx](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/(dashboard)/billing/page.tsx) | 8 |
| [video-actions.ts](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/actions/video-actions.ts) | 9 |
| [gemini-image.ts](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/lib/ai/providers/gemini-image.ts) | 9 |
| [stripe/webhook/route.ts](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/app/api/stripe/webhook/route.ts) | 10 |

### Manual steps (1)
| Step | Phase |
|---|---|
| Create Stripe Products & Prices in dashboard | 2 |

---

## Open Decisions (Need Your Input)

> [!IMPORTANT]
> Before starting implementation, I need your call on these:

1. **Credit card required for trial?** (I recommend yes — higher conversion, protects against API cost abuse.)
2. **`profiles` vs `users` table?** — The checkout route references `profiles` but the base schema has `users`. Which is the real table Supabase auth populates? Or do both exist?
3. **Pricing**: Are the prices I proposed ($49/$99/$249) acceptable, or do you want to start lower to match the current $19/$39/$69 range?
4. **The onboarding demo video**: Should it be a real generation (burns API credits but shows the real product) or a pre-rendered example video (zero cost but less impressive)?
5. **Enterprise tier**: Skip for now and add later, or include a "Contact Sales" card from day one?
