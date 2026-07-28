// Feature (OS notifications): thin wrapper around the browser Notification
// API, used for things worth surfacing even when the tab isn't focused --
// right now, a background auto-rescan finding new songs. Two things this
// deliberately does NOT do:
//   - never prompts for permission on its own; that only happens from an
//     explicit toggle in Settings (see requestNotificationPermission),
//     since an unsolicited permission prompt on page load is exactly the
//     kind of thing that makes a web app feel spammy.
//   - never fires while the tab is actually focused/visible, since the
//     in-app toast already covers that case -- showing both would just be
//     noise for something the person is already looking at.
//
// Android Chrome (and any Android APK built by wrapping this as a Trusted
// Web Activity -- still Chrome's engine underneath) rejects the plain
// `new Notification()` constructor and requires going through a registered
// service worker's `registration.showNotification()` instead. main.tsx
// registers public/sw.js purely to unlock that API (it does no caching).
// This function prefers that path whenever a service worker is available
// and falls back to the plain constructor for browsers that support one
// but not the other (desktop mostly supports both).

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission {
  if (!notificationsSupported()) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

export async function showBackgroundNotification(title: string, body: string): Promise<void> {
  if (!notificationsSupported()) return;
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState !== 'hidden') return; // tab is focused -- the toast already covers this

  const options: NotificationOptions = { body, icon: '/icons/icon-192.png', tag: 'melophile-status', silent: true };

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
      return;
    } catch {
      // Service worker registration never became ready (registration
      // failed, blocked by a privacy extension, etc.) -- fall through to
      // the plain constructor below, which still works on desktop.
    }
  }

  try {
    // eslint-disable-next-line no-new
    new Notification(title, options);
  } catch {
    // Android without a ready service worker, or iOS Safari -- neither
    // supports the plain constructor. Nothing more to do; the in-app toast
    // still covers the foreground case everywhere.
  }
}
