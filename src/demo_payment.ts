import { decidePayment } from "./payment_decision.js";

const event = {
  eventId: "pay_demo_001",
  userId: "user_demo_001",
  amountMinor: 125_000,
  currency: "USD",
  occurredAt: "2026-09-21T10:00:00.000Z",
};

const decision = decidePayment(
  event,
  "payment-risk-review-v1",
  { default_value: "active" },
  {},
);

console.log(JSON.stringify(decision, null, 2));
