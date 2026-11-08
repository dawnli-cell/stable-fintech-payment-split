import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { FlagValue } from "./infrai_client.js";

export const paymentEventSchema = z.object({
  eventId: z.string().min(1),
  userId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  occurredAt: z.string().datetime(),
});

export type PaymentEvent = z.infer<typeof paymentEventSchema>;
export type Bucket = "control" | "risk_review";

export type PaymentDecision = {
  eventId: string;
  userId: string;
  bucket: Bucket;
  action: "authorize" | "manual_review";
  notification: {
    auditId: string;
    kind: "payment_decision";
    reason: string;
    occurredAt: string;
  };
};

export function stableBucket(userId: string, experimentKey: string): Bucket {
  const digest = createHash("sha256").update(`${experimentKey}:${userId}`).digest();
  return digest.readUInt32BE(0) % 2 === 0 ? "control" : "risk_review";
}

export function decidePayment(
  event: PaymentEvent,
  experimentKey: string,
  flag: FlagValue,
  _resolvedUser: unknown,
): PaymentDecision {
  const bucket = stableBucket(event.userId, experimentKey);
  const flagLabel = String(flag.default_value);
  const action = bucket === "risk_review" && event.amountMinor >= 100_000
    ? "manual_review"
    : "authorize";
  return {
    eventId: event.eventId,
    userId: event.userId,
    bucket,
    action,
    notification: {
      auditId: randomUUID(),
      kind: "payment_decision",
      reason: `${experimentKey}:${flagLabel}:${bucket}:${action}`,
      occurredAt: event.occurredAt,
    },
  };
}
