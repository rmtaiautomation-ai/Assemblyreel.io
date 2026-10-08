import type {
  OperationOutcome, OperationState, StripeMode, SubscriptionSnapshot, UsageMetric,
} from "@/features/billing/types";

export interface BillingActor {
  readonly id: string;
  readonly email: string | null;
}

export type BillingResource = Readonly<{
  kind: "workspace" | "project" | "scene" | "media";
  id: string;
}>;

export interface BillingAccount {
  readonly id: string;
  readonly ownerId: string | null;
  readonly enabled: boolean;
  readonly stripeMode: StripeMode;
  readonly stripeCustomerId: string | null;
}

export interface ReservedOperation {
  readonly id: string;
  readonly state: OperationState;
  readonly created: boolean;
}

export interface ReservationInput {
  readonly accountId: string;
  readonly actorId: string;
  readonly resourceId: string;
  readonly operationKey: string;
  readonly fingerprint: string;
  readonly catalogVersion: string;
  readonly items: Readonly<Partial<Record<UsageMetric, number>>>;
  readonly maxPending: number;
}

export interface SettlementInput {
  readonly accountId: string;
  readonly operationId: string;
  readonly outcome: OperationOutcome;
  readonly provider?: string;
  readonly providerRequestId?: string;
  readonly errorCode?: string;
}

export interface BillingRepository {
  getAccountForActor(actorId: string): Promise<BillingAccount | null>;
  getCurrentSubscription(account: BillingAccount): Promise<SubscriptionSnapshot | null>;
  getResourceOwner(resource: BillingResource): Promise<string | null>;
  reserve(input: ReservationInput): Promise<ReservedOperation>;
  settle(input: SettlementInput): Promise<Readonly<{ id: string; state: OperationState; changed: boolean }>>;
}
