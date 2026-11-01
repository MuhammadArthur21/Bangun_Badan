import { describe, expect, it } from "vitest";
import { isTrustedPushEndpoint } from "./push";

describe("isTrustedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/subscription",
    "https://updates.push.services.mozilla.com/wpush/v2/subscription",
    "https://web.push.apple.com/subscription",
    "https://wns2.notify.windows.com/w/?token=subscription",
  ])("accepts supported browser push services: %s", (endpoint) => {
    expect(isTrustedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/subscription",
    "https://localhost/subscribe",
    "https://127.0.0.1/subscribe",
    "https://example.com/subscribe",
    "https://fcm.googleapis.com:444/subscribe",
    "https://user:password@fcm.googleapis.com/subscribe",
  ])("rejects untrusted push endpoints: %s", (endpoint) => {
    expect(isTrustedPushEndpoint(endpoint)).toBe(false);
  });
});
