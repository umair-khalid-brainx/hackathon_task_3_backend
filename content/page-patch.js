const EXTENSION_ID = 'focus-mode-extension';
const EVENT_NOTIFICATION_ATTEMPT = `${EXTENSION_ID}:notification-attempt`;
const EVENT_FOCUS_STATE = `${EXTENSION_ID}:focus-state`;
const EVENT_WHITELIST_STATE = `${EXTENSION_ID}:whitelist-state`;
const EVENT_REQUEST_STATE = `${EXTENSION_ID}:request-state`;

(function patchPageNotifications() {
  if (window.__focusModePagePatch) return;
  window.__focusModePagePatch = true;

  let focusModeActive = false;
  let whitelistedDomains = [];

  function isWhitelisted(hostname) {
    if (!hostname || whitelistedDomains.length === 0) return false;

    const host = hostname.toLowerCase();
    const bareHost = host.replace(/^www\./, '');

    return whitelistedDomains.some((entry) => {
      const domain = entry.toLowerCase();

      return (
        bareHost === domain ||
        host === domain ||
        host === `www.${domain}` ||
        bareHost.endsWith(`.${domain}`)
      );
    });
  }

  function syncFromDocument() {
    focusModeActive =
      document.documentElement.dataset.focusModeExtension === 'on';

    const rawWhitelist = document.documentElement.dataset.focusModeWhitelist;

    if (!rawWhitelist) {
      whitelistedDomains = [];
      return;
    }

    try {
      whitelistedDomains = JSON.parse(rawWhitelist);
    } catch {
      whitelistedDomains = [];
    }
  }

  document.addEventListener(EVENT_FOCUS_STATE, (event) => {
    focusModeActive = Boolean(event.detail?.enabled);
  });

  document.addEventListener(EVENT_WHITELIST_STATE, (event) => {
    whitelistedDomains = Array.isArray(event.detail?.domains)
      ? event.detail.domains
      : [];
  });

  function reportNotificationAttempt() {
    document.dispatchEvent(
      new CustomEvent(EVENT_NOTIFICATION_ATTEMPT, {
        detail: {
          hostname: window.location.hostname || 'unknown',
        },
      })
    );
  }

  function shouldBlockNotifications() {
    return focusModeActive && !isWhitelisted(window.location.hostname);
  }

  const OriginalNotification = window.Notification;
  if (!OriginalNotification) return;

  function PatchedNotification(title, options) {
    reportNotificationAttempt();

    if (shouldBlockNotifications()) {
      return {
        close() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
        title: title || '',
        body: options?.body || '',
      };
    }

    return new OriginalNotification(title, options);
  }

  PatchedNotification.requestPermission = (callback) => {
    if (shouldBlockNotifications()) {
      const result = Promise.resolve('denied');
      if (typeof callback === 'function') result.then(callback);
      return result;
    }

    return OriginalNotification.requestPermission(callback);
  };

  Object.defineProperty(PatchedNotification, 'permission', {
    configurable: true,
    get() {
      return shouldBlockNotifications() ? 'denied' : OriginalNotification.permission;
    },
  });

  if ('maxActions' in OriginalNotification) {
    PatchedNotification.maxActions = OriginalNotification.maxActions;
  }

  window.Notification = PatchedNotification;

  syncFromDocument();
  document.dispatchEvent(new CustomEvent(EVENT_REQUEST_STATE));
})();
