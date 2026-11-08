import assert from "node:assert/strict";
import test from "node:test";
import { decidePayment, stableBucket } from "../src/payment_decision.js";

test("the same fintech user keeps one bucket and high-value treatment", () => {
  const userId = "user_ledger_42";
  const experimentKey = "payment-risk-review-v1";
  const first = stableBucket(userId, experimentKey);
  const second = stableBucket(userId, experimentKey);
  assert.equal(first, second);

  const decision = decidePayment(
    {
      eventId: "pay_42",
      userId,
      amountMinor: 250_000,
      currency: "USD",
      occurredAt: "2026-09-21T10:00:00.000Z",
    },
    experimentKey,
    { default_value: "active" },
    {},
  );

  assert.equal(decision.bucket, first);
  assert.equal(
    decision.action,
    first === "risk_review" ? "manual_review" : "authorize",
  );
  assert.match(decision.notification.reason, new RegExp(`${first}:${decision.action}$`));
});
