self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() ?? "" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Bangun Badan", {
      body: payload.body ?? "Waktunya latihan.",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: payload.tag ?? "bangun-badan-workout",
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url === destination);
      if (existing) return existing.focus();
      return self.clients.openWindow(destination);
    }),
  );
});
