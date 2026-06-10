const EXTENSION_ID = 'focus-mode-extension';
const EVENT_NOTIFICATION_ATTEMPT = `${EXTENSION_ID}:notification-attempt`;
const EVENT_FOCUS_STATE = `${EXTENSION_ID}:focus-state`;
const EVENT_WHITELIST_STATE = `${EXTENSION_ID}:whitelist-state`;
const EVENT_REQUEST_STATE = `${EXTENSION_ID}:request-state`;

const FOCUS_MODE_KEY = 'focusModeEnabled';
const WHITELIST_KEY = 'whitelistDomains';

let focusModeEnabled = false;
let whitelistedDomains = [];

function isHostnameWhitelisted(hostname, domains = whitelistedDomains) {
  if (!hostname || !Array.isArray(domains) || domains.length === 0) return false;

  const host = hostname.toLowerCase();
  const bareHost = host.replace(/^www\./, '');

  return domains.some((entry) => {
    const domain = entry.toLowerCase();

    return (
      bareHost === domain ||
      host === domain ||
      host === `www.${domain}` ||
      bareHost.endsWith(`.${domain}`)
    );
  });
}

function broadcastFocusModeState(enabled) {
  focusModeEnabled = Boolean(enabled);
  document.documentElement.dataset.focusModeExtension = focusModeEnabled ? 'on' : 'off';

  document.dispatchEvent(
    new CustomEvent(EVENT_FOCUS_STATE, {
      detail: { enabled: focusModeEnabled },
    })
  );
}

function broadcastWhitelistState(domains) {
  whitelistedDomains = Array.isArray(domains) ? domains : [];
  document.documentElement.dataset.focusModeWhitelist = JSON.stringify(
    whitelistedDomains
  );

  document.dispatchEvent(
    new CustomEvent(EVENT_WHITELIST_STATE, {
      detail: { domains: whitelistedDomains },
    })
  );
}

function reportBlockedNotification(hostname) {
  chrome.runtime.sendMessage(
    {
      type: 'NOTIFICATION_BLOCKED',
      hostname,
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error(
          'Focus Mode: failed to record blocked notification',
          chrome.runtime.lastError
        );
      }
    }
  );
}

function handleNotificationAttempt(hostname) {
  chrome.storage.local.get(
    { [FOCUS_MODE_KEY]: false, [WHITELIST_KEY]: [] },
    (result) => {
      if (chrome.runtime.lastError) {
        console.error('Focus Mode: failed to read storage', chrome.runtime.lastError);
        return;
      }

      broadcastFocusModeState(result[FOCUS_MODE_KEY]);
      broadcastWhitelistState(result[WHITELIST_KEY]);

      if (!result[FOCUS_MODE_KEY]) return;
      if (isHostnameWhitelisted(hostname, result[WHITELIST_KEY])) return;

      reportBlockedNotification(hostname);
    }
  );
}

function loadStateFromStorage() {
  chrome.storage.local.get(
    { [FOCUS_MODE_KEY]: false, [WHITELIST_KEY]: [] },
    (result) => {
      if (chrome.runtime.lastError) {
        console.error('Focus Mode: failed to load state', chrome.runtime.lastError);
        return;
      }

      broadcastFocusModeState(result[FOCUS_MODE_KEY]);
      broadcastWhitelistState(result[WHITELIST_KEY]);
    }
  );
}

document.addEventListener(EVENT_NOTIFICATION_ATTEMPT, (event) => {
  handleNotificationAttempt(event.detail?.hostname);
});

document.addEventListener(EVENT_REQUEST_STATE, loadStateFromStorage);

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'FOCUS_MODE_STATE') {
    broadcastFocusModeState(message.enabled);
  }

  if (message.type === 'WHITELIST_STATE') {
    broadcastWhitelistState(message.domains);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes[FOCUS_MODE_KEY]) {
    broadcastFocusModeState(changes[FOCUS_MODE_KEY].newValue);
  }

  if (changes[WHITELIST_KEY]) {
    broadcastWhitelistState(changes[WHITELIST_KEY].newValue);
  }
});

loadStateFromStorage();
