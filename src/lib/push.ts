const PUSH_SERVICE_DOMAINS = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
];

export function isTrustedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      PUSH_SERVICE_DOMAINS.some(
        (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    );
  } catch {
    return false;
  }
}
