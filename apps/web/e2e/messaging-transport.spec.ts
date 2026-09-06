import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, signup } from "./helpers";

test("labels a Sendblue group message with its actual transport", async ({ page }, testInfo) => {
  const stamp = Date.now();
  await signup(page, `messaging-transport-${stamp}@rakazo.test`, "password12", "Transport E2E");
  await completeOnboarding(page);
  await page.goto("/app");
  await page.waitForURL(/\/app\/[^/]+$/);

  const appendTransportMessage = (body: {
    json?: {
      threadId?: string;
      cursor?: number;
      messages?: unknown[];
      thread?: { threadId?: string; cursor?: number; messages?: unknown[] };
    };
  }) => {
    const append = (snapshot?: { threadId?: string; cursor?: number; messages?: unknown[] }) => {
      if (!snapshot?.threadId || !snapshot.messages) return;
      const id = `transport-message-${stamp}`;
      if (snapshot.messages.some((message) => (message as { id?: string }).id === id)) return;

      const seq = (snapshot.cursor ?? 0) + 1;
      snapshot.cursor = seq;
      snapshot.messages.push({
        id,
        threadId: snapshot.threadId,
        seq,
        role: "system",
        blocks: [
          {
            kind: "channel_message",
            provider: "sendblue",
            transport: "SMS",
            channelId: `transport-channel-${stamp}`,
            fromAddress: "+15551234567",
            fromLabel: "Alice",
            text: "Dinner is at seven.",
          },
        ],
        createdAt: new Date().toISOString(),
      });
    };

    append(body.json);
    append(body.json?.thread);
  };

  const interceptSnapshot = async (route: Parameters<Parameters<typeof page.route>[1]>[0]) => {
    const response = await route.fetch();
    const body = (await response.json()) as Parameters<typeof appendTransportMessage>[0];
    appendTransportMessage(body);
    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body: JSON.stringify(body),
    });
  };

  await page.route("**/rpc/bootstrap", interceptSnapshot);
  await page.route("**/rpc/threads/get", interceptSnapshot);

  await page.reload({ waitUntil: "domcontentloaded" });
  const transportMessage = page.getByText("SMS · Alice: Dinner is at seven.");
  await expect(transportMessage).toBeVisible();
  await captureScreenshot(page, testInfo, "sendblue-sms-transport");
});
