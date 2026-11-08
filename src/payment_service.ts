import { createServer } from "node:http";
import { InfraiClient, InfraiError } from "./infrai_client.js";
import { decidePayment, paymentEventSchema } from "./payment_decision.js";

const experimentKey = "payment-risk-review-v1";
const infrai = new InfraiClient();

async function readJson(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/payment-events") {
    sendJson(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const parsed = paymentEventSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      sendJson(response, 400, { error: "invalid_payment_event", issues: parsed.error.issues });
      return;
    }

    const [flag, user] = await Promise.all([
      infrai.flags.get_value(experimentKey),
      infrai.auth.user.get(parsed.data.userId),
    ]);
    sendJson(response, 200, decidePayment(parsed.data, experimentKey, flag, user));
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: "invalid_json" });
      return;
    }
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      sendJson(response, error.status, { error: error.code, message: error.message });
      return;
    }
    sendJson(response, 502, { error: "upstream_request_failed" });
  }
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`payment decision service listening on ${port}`));
}
