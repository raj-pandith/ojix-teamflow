// OJIX TeamFlow Service Worker for OS-Level Native Web Push Notifications
// Conforms to W3C Web Push & Notifications API standard using VAPID

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

/**
 * Compute safe relative target route from notification metadata
 * Prevents arbitrary URL redirection to external malicious origins
 */
function getSafeRelativeRoute(data) {
  if (!data || typeof data !== 'object') {
    return '/';
  }

  // Deleted project notice
  if (data.type === 'PROJECT_DELETED') {
    return '/messages';
  }

  // Blocked account notice
  if (data.type === 'USER_BLOCKED') {
    return '/';
  }

  // Direct message
  if (data.type === 'DIRECT_MESSAGE_RECEIVED' && data.conversationId) {
    return `/messages?conversationId=${encodeURIComponent(data.conversationId)}`;
  }

  // Task / Comment mention
  if (data.projectId && data.taskId) {
    const commentParam = data.commentId ? `&commentId=${encodeURIComponent(data.commentId)}` : '';
    return `/projects?projectId=${encodeURIComponent(data.projectId)}&taskId=${encodeURIComponent(data.taskId)}${commentParam}`;
  }

  // Project membership or lead assignment
  if (data.projectId) {
    return `/projects?projectId=${encodeURIComponent(data.projectId)}`;
  }

  return '/messages';
}

// OS Notification Click Handler - Focuses or opens the application outside the browser
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data = event.notification.data || {};
  const relativeTarget = getSafeRelativeRoute(data);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // 1. Try to find an existing TeamFlow browser window and focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: data,
            route: relativeTarget,
          });
          return client.focus();
        }
      }

      // 2. If no window is open, open a new window at the safe relative URL
      if (self.clients.openWindow) {
        return self.clients.openWindow(relativeTarget);
      }
    })
  );
});

// Native Web Push Event Handler (triggered by browser vendor push service via VAPID)
self.addEventListener('push', event => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch (jsonErr) {
      // Fallback for plain text payload
      payload = {
        title: 'OJIX TeamFlow Alert',
        body: event.data.text() || 'You have received a new update.',
      };
    }
  } else {
    payload = {
      title: 'OJIX TeamFlow Update',
      body: 'You have new activity in your workspace.',
    };
  }

  const title = payload.title || 'OJIX TeamFlow';
  const options = {
    body: payload.body || 'New operational activity in TeamFlow.',
    icon: payload.icon || '/vite.svg',
    badge: payload.badge || '/vite.svg',
    tag: payload.tag || payload.id || `teamflow-${Date.now()}`,
    data: payload,
    timestamp: payload.timestamp || Date.now(),
    requireInteraction: true, // Keep notification visible on Windows/macOS desktop until user acts
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
