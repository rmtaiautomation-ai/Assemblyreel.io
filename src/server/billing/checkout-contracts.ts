import type { BillingAccount, BillingActor } from "./repository";
import type { BillingOffer } from "./catalog";
import type { BillingPlan, StripeMode } from "@/features/billing/types";

export interface CheckoutAttempt {
  readonly id: string;
  readonly state: "pending" | "ready" | "unknown" | "expired" | "complete";
  readonly created: boolean;
  readonly url: string | null;
  readonly expiresAt: string | null;
}

export interface CheckoutRepository {
  getAccountForActor(actorId: string): Promise<BillingAccount | null>;
  begin(input: Readonly<{ accountId: string; actorId: string; operationKey: string; fingerprint: string; offer: BillingOffer }>): Promise<CheckoutAttempt>;
  bindCustomer(accountId: string, actorId: string, customerId: string): Promise<void>;
  ready(accountId: string, attemptId: string, session: CheckoutSession): Promise<void>;
  markUnknown(accountId: string, attemptId: string): Promise<void>;
}

export interface CheckoutSession {
  readonly id: string;
  readonly url: string;
  readonly expiresAt: string;
}

export interface StripePriceSnapshot {
  readonly id: string;
  readonly mode: StripeMode;
  readonly active: boolean;
  readonly productActive: boolean;
  readonly amount: number | null;
  readonly currency: string;
  readonly interval: string | null;
  readonly intervalCount: number | null;
  readonly usageType: string | null;
  readonly billingScheme: string;
}

export interface StripeBillingGateway {
  readonly mode: StripeMode;
  getPrice(id: string): Promise<StripePriceSnapshot>;
  createCustomer(accountId: string, actor: BillingActor): Promise<string>;
  verifyCustomer(customerId: string, accountId: string): Promise<void>;
  hasNonTerminalSubscription(customerId: string): Promise<boolean>;
  createCheckout(input: Readonly<{ accountId: string; attemptId: string; customerId: string; offer: BillingOffer; origin: string }>): Promise<CheckoutSession>;
  createPortal(customerId: string, origin: string): Promise<string>;
}

export interface CheckoutDependencies {
  readonly salesEnabled: boolean;
  readonly portalEnabled: boolean;
  readonly verifyActor: () => Promise<BillingActor | null>;
  readonly repository: CheckoutRepository;
  readonly stripe: StripeBillingGateway;
  readonly approvedPlans: readonly BillingPlan[];
  readonly approvedOffers: readonly BillingOffer[];
  readonly siteOrigin: string;
  readonly now?: () => number;
}
