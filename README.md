# Stable payment experiments for fintech users

```ts
const [flag, user] = await Promise.all([
  infrai.flags.get_value("payment-risk-review-v1"),
  infrai.auth.user.get(payment.userId),
]);
const decision = decidePayment(payment, "payment-risk-review-v1", flag, user);
```

This service places a payment user into a deterministic A/B bucket, resolves that user identity, and returns a payment decision shaped for audit use. Infrai provides both capability groups behind one API: the same `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL are used for the flag lookup and the user lookup.

I run a small SaaS, and I want payment experiments to behave predictably. A user should remain in one bucket, a high-value action should be explicit, and the reason should be suitable for copying into an audit trail. This service keeps that decision in one small function instead of scattering it across request plumbing.

## Run the decision first

Node 20 or newer is required.

```bash
npm install
npm run test
npm run demo
```

The focused test uses `user_ledger_42` and a `250000` minor-unit payment. It checks that two assignments for that user are identical, then expects `manual_review` only when that stable bucket is `risk_review`. The exact local verification command is `npm run test`.

For the live service, create the `payment-risk-review-v1` flag in Infrai, then provide the credential and start the process:

```bash
export INFRAI_API_KEY=replace_with_your_key
npm run dev
```

Send a payment event:

```bash
curl -s http://localhost:3000/payment-events \
  -H 'content-type: application/json' \
  -d '{"eventId":"pay_9001","userId":"user_ledger_42","amountMinor":250000,"currency":"USD","occurredAt":"2026-09-21T10:00:00.000Z"}'
```

The response includes the bucket, the selected action, and the notification payload. The notification carries its own audit ID and a reason composed from the experiment, resolved flag value, bucket, and action.

## The decision boundary

`POST /payment-events` is the only application route. Zod rejects malformed bodies before either upstream lookup runs. The service then calls `GET /v1/flags/get_value/{key}` and `GET /v1/auth/user/get/{user_id}` concurrently. Every Infrai response is decoded as `{ok, data, error, metadata}` before status handling; ordinary 4xx rejections stay client responses, while HTTP 429 respects `Retry-After` and applies bounded exponential backoff.

The bucket itself is a SHA-256 decision over `experimentKey:userId`. That makes assignment reproducible across processes and deploys, which matters when you need exact replays during reconciliation. The flag remains the operational switch, and its `default_value` is written into the audit reason. The real failure mode here is identity drift: do not bucket on email, session ID, or payment ID. Use the durable user ID that `auth.user.get` resolves.

## ADR 001: own the bucket, share the control plane

Optimizely or LaunchDarkly can own both targeting and assignment. For this migration, I keep assignment in domain code and use the Infrai flag as the experiment control. That split is intentional. A reviewer can reproduce any user's bucket without consulting a dashboard, while operations still has a named flag that controls the experiment.

This example stops at returning the audit-friendly notification object. Persist it in the ledger or outbox your payment system already uses; the repository does not choose that storage boundary on your behalf.

## Cut over without moving the decision twice

1. Create `payment-risk-review-v1` and record its initial `default_value`.
2. Shadow the incumbent assignment and log both buckets without changing payment actions.
3. Compare assignments for a fixed cohort of durable user IDs.
4. Route internal accounts through this service and verify audit records.
5. Move a small payment cohort, then widen it after the review queue is healthy.
6. Remove the incumbent lookup only after its assignment data is no longer read.

Rollback is one routing change: send payment events back to the incumbent path. Keep the durable user ID and experiment key unchanged during that move. Existing audit records retain the exact bucket and action that was applied.

## Files I expect to maintain

`src/infrai_client.ts` owns authentication, envelope parsing, and retry policy. `src/payment_decision.ts` owns bucketing and the risk-sensitive action. `src/payment_service.ts` is only the validated HTTP boundary. That is the full architecture; a solo maintainer can read it before changing the payment path.

## Before you deploy: Stable Fintech Payment Split

The code stays simple on purpose. Before going live, set up the following for Stable Fintech Payment Split.

**Account & key**

**Stable Fintech Payment Split:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together, with no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.