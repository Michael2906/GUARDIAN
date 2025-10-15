/**
 * Service Worker for Push Notifications
 * GUARDIAN 3PL Platform
 */

const CACHE_NAME = "guardian-v1";
const urlsToCache = ["/", "/2fa.html", "/2fa-verify.html"];

// Install event - cache resources
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Push event - handle incoming push notifications
self.addEventListener("push", (event) => {
  console.log("Push event received:", event);

  let notificationData = {};

  try {
    if (event.data) {
      notificationData = event.data.json();
    }
  } catch (error) {
    console.error("Error parsing push data:", error);
    notificationData = {
      title: "🔐 GUARDIAN 2FA",
      body: "New authentication request",
      icon: "/favicon.ico",
    };
  }

  const options = {
    body: notificationData.body || "New authentication request",
    icon: notificationData.icon || "/favicon.ico",
    badge: notificationData.badge || "/favicon.ico",
    tag: notificationData.tag || "2fa-notification",
    requireInteraction: notificationData.requireInteraction !== false,
    actions: notificationData.actions || [
      {
        action: "approve",
        title: "✅ Approve",
        icon: "/icons/check.png",
      },
      {
        action: "deny",
        title: "❌ Deny",
        icon: "/icons/close.png",
      },
    ],
    data: notificationData.data || {},
  };

  event.waitUntil(
    self.registration.showNotification(
      notificationData.title || "🔐 GUARDIAN 2FA",
      options
    )
  );
});

// Notification click event
self.addEventListener("notificationclick", (event) => {
  console.log("Notification click received:", event);

  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  if (action === "approve" || action === "deny") {
    // Handle 2FA approval/denial
    event.waitUntil(handleLoginApproval(action, data));
  } else {
    // Default action - open the app
    event.waitUntil(clients.openWindow("/"));
  }
});

// Handle login approval/denial
async function handleLoginApproval(action, data) {
  try {
    if (data.sessionId) {
      // Send approval/denial to server
      const response = await fetch(
        `/api/push/approve-login/${data.sessionId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        }
      );

      if (response.ok) {
        // Show success notification
        await self.registration.showNotification(
          `Login ${action === "approve" ? "Approved" : "Denied"}`,
          {
            body: `You have ${action}d the login request.`,
            icon: "/favicon.ico",
            tag: "login-response",
            requireInteraction: false,
          }
        );
      }
    }

    // Open the app
    const windowClients = await clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    if (windowClients.length > 0) {
      // Focus existing window
      await windowClients[0].focus();
    } else {
      // Open new window
      await clients.openWindow("/");
    }
  } catch (error) {
    console.error("Error handling login approval:", error);
  }
}

// Fetch event - serve from cache when offline
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached version or fetch from network
      return response || fetch(event.request);
    })
  );
});

// Background sync for offline actions
self.addEventListener("sync", (event) => {
  if (event.tag === "background-sync") {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Handle any background sync operations
  console.log("Background sync triggered");
}
