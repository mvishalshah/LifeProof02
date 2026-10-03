self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || "It's time for your habit." };
  }

  event.waitUntil(self.registration.showNotification(payload.title || "LifeProof habit reminder", {
    body: payload.body || "It's time for your habit.",
    data: { url: payload.url || "/habits" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/habits", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    const client = clients.find(windowClient => windowClient.url.startsWith(self.location.origin));
    if (client) {
      return client.navigate(target).then(() => client.focus());
    }
    return self.clients.openWindow(target);
  }));
});
