const FOCUS_MODE_KEY = 'focusModeEnabled';
const LAST_SESSION_SUMMARY_KEY = 'lastSessionSummary';

const toggle = document.getElementById('focus-toggle');
const toggleState = document.getElementById('toggle-state');
const toggleHint = document.getElementById('toggle-hint');
const status = document.getElementById('status');
const sessionSummary = document.getElementById('session-summary');
const summaryTotal = document.getElementById('summary-total');
const summarySites = document.getElementById('summary-sites');

function hideSessionSummary() {
  sessionSummary.hidden = true;
  summaryTotal.textContent = '';
  summarySites.innerHTML = '';
}

function showSessionSummary(summary) {
  if (!summary) {
    hideSessionSummary();
    return;
  }

  sessionSummary.hidden = false;

  if (summary.total === 0) {
    summaryTotal.textContent = 'No notifications were blocked this session.';
    summarySites.innerHTML = '';
    return;
  }

  const label = summary.total === 1 ? 'notification' : 'notifications';
  summaryTotal.textContent = `${summary.total} ${label} blocked`;

  const sites = Object.entries(summary.bySite).sort((a, b) => b[1] - a[1]);

  summarySites.innerHTML = sites
    .map(
      ([site, count]) => `
        <li class="session-summary__site">
          <span class="session-summary__site-name">${escapeHtml(site)}</span>
          <span class="session-summary__site-count">${count}</span>
        </li>
      `
    )
    .join('');
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function updateUI(enabled, summary = null) {
  toggle.classList.toggle('is-active', enabled);
  toggle.setAttribute('aria-pressed', String(enabled));
  status.classList.toggle('is-active', enabled);
  status.classList.remove('is-error');

  toggleState.textContent = enabled ? 'ON' : 'OFF';
  toggleHint.textContent = enabled
    ? 'Notifications are blocked'
    : 'Tap to block notifications';

  if (enabled) {
    hideSessionSummary();
    status.textContent = 'Focus Mode is active. All notification popups are silenced.';
    return;
  }

  status.textContent = 'Focus Mode is off. Sites can send notifications again.';

  if (summary) {
    showSessionSummary(summary);
  }
}

toggle.addEventListener('click', async () => {
  const enabled = !toggle.classList.contains('is-active');

  toggle.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SET_FOCUS_MODE',
      enabled,
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Failed to update Focus Mode');
    }

    updateUI(response.enabled, response.sessionSummary);
  } catch (error) {
    status.classList.add('is-error');
    status.textContent = 'Could not update Focus Mode. Try again.';
    console.error(error);
  } finally {
    toggle.disabled = false;
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  const {
    [FOCUS_MODE_KEY]: focusModeEnabled = false,
    [LAST_SESSION_SUMMARY_KEY]: lastSessionSummary,
  } = await chrome.storage.local.get([FOCUS_MODE_KEY, LAST_SESSION_SUMMARY_KEY]);

  updateUI(focusModeEnabled, focusModeEnabled ? null : lastSessionSummary);

  document.getElementById('open-schedule').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});
