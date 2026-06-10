import {
  SCHEDULE_ALARM_NAME,
  SCHEDULE_LAST_FIRED_KEY,
  SCHEDULES_KEY,
  SCHEDULER_SESSION_KEY,
  buildScheduleEventKey,
  defaultScheduleRanges,
  getCurrentMinutes,
  getTodayKey,
  normalizeScheduleRanges,
  parseTimeToMinutes,
  pruneScheduleLastFired,
} from '../shared/schedules.js';
import {
  WHITELIST_KEY,
  getContentSettingPatterns,
  isHostnameWhitelisted,
  normalizeWhitelist,
} from '../shared/whitelist.js';
import {
  BLOCK_HISTORY_KEY,
  buildDistractionScores,
  emptyBlockHistory,
  normalizeBlockedHostname,
} from '../shared/distraction-score.js';

const FOCUS_MODE_KEY = 'focusModeEnabled';
const SESSION_STATS_KEY = 'sessionStats';
const LAST_SESSION_SUMMARY_KEY = 'lastSessionSummary';

const emptySessionStats = () => ({ total: 0, bySite: {} });

let recordWriteQueue = Promise.resolve();

function enqueueRecord(task) {
  const next = recordWriteQueue.then(task);
  recordWriteQueue = next.catch(() => {});
  return next;
}

async function getSessionStats() {
  const { [SESSION_STATS_KEY]: sessionStats } =
    await chrome.storage.local.get(SESSION_STATS_KEY);

  return sessionStats || emptySessionStats();
}

async function resetSessionStats() {
  await chrome.storage.local.set({ [SESSION_STATS_KEY]: emptySessionStats() });
}

async function recordBlockedNotificationWork(hostname) {
  const site = normalizeBlockedHostname(hostname);
  const [{ [FOCUS_MODE_KEY]: focusModeEnabled = false }, whitelist] = await Promise.all([
    chrome.storage.local.get(FOCUS_MODE_KEY),
    getWhitelist(),
  ]);

  if (!focusModeEnabled || isHostnameWhitelisted(site, whitelist)) {
    return;
  }

  const stats = await getSessionStats();
  const nextStats = {
    total: stats.total + 1,
    bySite: {
      ...stats.bySite,
      [site]: (stats.bySite[site] || 0) + 1,
    },
  };

  await chrome.storage.local.set({ [SESSION_STATS_KEY]: nextStats });

  const blockHistory = await getBlockHistory();
  const nextHistory = {
    total: blockHistory.total + 1,
    bySite: {
      ...blockHistory.bySite,
      [site]: (blockHistory.bySite[site] || 0) + 1,
    },
  };

  await chrome.storage.local.set({ [BLOCK_HISTORY_KEY]: nextHistory });
}

async function recordBlockedNotification(hostname) {
  return enqueueRecord(() => recordBlockedNotificationWork(hostname));
}

async function getBlockHistory() {
  const { [BLOCK_HISTORY_KEY]: blockHistory = emptyBlockHistory() } =
    await chrome.storage.local.get(BLOCK_HISTORY_KEY);

  return blockHistory;
}

async function getWhitelist() {
  const { [WHITELIST_KEY]: whitelistDomains = [] } =
    await chrome.storage.local.get(WHITELIST_KEY);

  return normalizeWhitelist(whitelistDomains);
}

async function applyNotificationBlocking(enabled) {
  if (!enabled) {
    await chrome.contentSettings.notifications.set({
      primaryPattern: '*://*/*',
      setting: 'ask',
    });
    return;
  }

  await chrome.contentSettings.notifications.set({
    primaryPattern: '*://*/*',
    setting: 'block',
  });

  const whitelist = await getWhitelist();

  for (const domain of whitelist) {
    for (const pattern of getContentSettingPatterns(domain)) {
      await chrome.contentSettings.notifications.set({
        primaryPattern: pattern,
        setting: 'allow',
      });
    }
  }
}

async function broadcastFocusModeToTabs(enabled) {
  const tabs = await chrome.tabs.query({});

  await Promise.allSettled(
    tabs.map((tab) => {
      if (tab.id === undefined) return Promise.resolve();

      return chrome.tabs.sendMessage(tab.id, {
        type: 'FOCUS_MODE_STATE',
        enabled,
      });
    })
  );
}

async function broadcastWhitelistToTabs(domains) {
  const tabs = await chrome.tabs.query({});

  await Promise.allSettled(
    tabs.map((tab) => {
      if (tab.id === undefined) return Promise.resolve();

      return chrome.tabs.sendMessage(tab.id, {
        type: 'WHITELIST_STATE',
        domains,
      });
    })
  );
}

async function syncWhitelistEffects() {
  const focusModeEnabled = await getFocusModeEnabled();
  const whitelist = await getWhitelist();

  if (focusModeEnabled) {
    await applyNotificationBlocking(true);
  }

  await broadcastWhitelistToTabs(whitelist);
}

async function updateActionUI(enabled) {
  if (enabled) {
    await chrome.action.setBadgeText({ text: 'ON' });
    await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
    await chrome.action.setTitle({ title: 'Focus Mode: ON (Alt+Shift+F)' });
    return;
  }

  await chrome.action.setBadgeText({ text: '' });
  await chrome.action.setTitle({ title: 'Focus Mode: OFF (Alt+Shift+F)' });
}

async function getFocusModeEnabled() {
  const { [FOCUS_MODE_KEY]: focusModeEnabled = false } =
    await chrome.storage.local.get(FOCUS_MODE_KEY);

  return focusModeEnabled;
}

async function getSchedulerSession() {
  const { [SCHEDULER_SESSION_KEY]: schedulerSession = null } =
    await chrome.storage.local.get(SCHEDULER_SESSION_KEY);

  return schedulerSession;
}

async function setFocusMode(enabled, { source = 'manual', rangeIndex = null } = {}) {
  if (enabled) {
    await resetSessionStats();

    const schedulerSession =
      source === 'scheduler' && rangeIndex !== null ? { rangeIndex } : null;

    await chrome.storage.local.set({
      [FOCUS_MODE_KEY]: true,
      [SCHEDULER_SESSION_KEY]: schedulerSession,
    });
    await chrome.storage.local.remove(LAST_SESSION_SUMMARY_KEY);
    await applyNotificationBlocking(true);
    await broadcastFocusModeToTabs(true);
    await updateActionUI(true);
    return { enabled: true, sessionSummary: null };
  }

  await recordWriteQueue;
  const sessionSummary = await getSessionStats();

  await chrome.storage.local.set({
    [FOCUS_MODE_KEY]: false,
    [LAST_SESSION_SUMMARY_KEY]: sessionSummary,
    [SCHEDULER_SESSION_KEY]: null,
  });
  await applyNotificationBlocking(false);
  await broadcastFocusModeToTabs(false);
  await updateActionUI(false);

  return { enabled: false, sessionSummary: { ...sessionSummary } };
}

async function toggleFocusMode() {
  const focusModeEnabled = await getFocusModeEnabled();
  return setFocusMode(!focusModeEnabled, { source: 'manual' });
}

async function schedulerStart(rangeIndex) {
  const focusModeEnabled = await getFocusModeEnabled();
  if (focusModeEnabled) return;

  await setFocusMode(true, { source: 'scheduler', rangeIndex });
}

async function schedulerStop(rangeIndex) {
  const focusModeEnabled = await getFocusModeEnabled();
  const schedulerSession = await getSchedulerSession();

  if (!focusModeEnabled || !schedulerSession) return;
  if (schedulerSession.rangeIndex !== rangeIndex) return;

  await setFocusMode(false, { source: 'scheduler' });
}

async function getScheduleRanges() {
  const { [SCHEDULES_KEY]: scheduleRanges } =
    await chrome.storage.local.get(SCHEDULES_KEY);

  return normalizeScheduleRanges(scheduleRanges || defaultScheduleRanges());
}

async function runScheduleCheck() {
  const scheduleRanges = await getScheduleRanges();
  const now = new Date();
  const todayKey = getTodayKey(now);
  const currentMinutes = getCurrentMinutes(now);

  const { [SCHEDULE_LAST_FIRED_KEY]: scheduleLastFired = {} } =
    await chrome.storage.local.get(SCHEDULE_LAST_FIRED_KEY);

  const nextLastFired = pruneScheduleLastFired(scheduleLastFired, todayKey);

  for (let rangeIndex = 0; rangeIndex < scheduleRanges.length; rangeIndex += 1) {
    const range = scheduleRanges[rangeIndex];
    if (!range.enabled) continue;

    const startMinutes = parseTimeToMinutes(range.start);
    const endMinutes = parseTimeToMinutes(range.end);
    const startKey = buildScheduleEventKey(todayKey, rangeIndex, 'start');
    const stopKey = buildScheduleEventKey(todayKey, rangeIndex, 'stop');

    if (currentMinutes === startMinutes && nextLastFired[startKey] !== currentMinutes) {
      await schedulerStart(rangeIndex);
      nextLastFired[startKey] = currentMinutes;
    }

    if (currentMinutes === endMinutes && nextLastFired[stopKey] !== currentMinutes) {
      await schedulerStop(rangeIndex);
      nextLastFired[stopKey] = currentMinutes;
    }
  }

  await chrome.storage.local.set({ [SCHEDULE_LAST_FIRED_KEY]: nextLastFired });
}

async function ensureScheduleAlarm() {
  const alarm = await chrome.alarms.get(SCHEDULE_ALARM_NAME);

  if (!alarm) {
    await chrome.alarms.create(SCHEDULE_ALARM_NAME, { periodInMinutes: 1 });
  }
}

async function restoreFocusMode() {
  const focusModeEnabled = await getFocusModeEnabled();

  await applyNotificationBlocking(focusModeEnabled);
  await updateActionUI(focusModeEnabled);
  await syncWhitelistEffects();
  await ensureScheduleAlarm();
  await runScheduleCheck();
}

async function saveWhitelist(domains) {
  const normalized = normalizeWhitelist(domains);
  await chrome.storage.local.set({ [WHITELIST_KEY]: normalized });
  await syncWhitelistEffects();
  return normalized;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'NOTIFICATION_BLOCKED') {
    recordBlockedNotification(message.hostname)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));

    return true;
  }

  if (message.type === 'SET_FOCUS_MODE') {
    setFocusMode(message.enabled, { source: 'manual' })
      .then(({ enabled, sessionSummary }) =>
        sendResponse({ success: true, enabled, sessionSummary })
      )
      .catch((error) => sendResponse({ success: false, error: error.message }));

    return true;
  }

  if (message.type === 'GET_SCHEDULES') {
    getScheduleRanges()
      .then((schedules) => sendResponse({ success: true, schedules }))
      .catch((error) => sendResponse({ success: false, error: error.message }));

    return true;
  }

  if (message.type === 'SAVE_SCHEDULES') {
    chrome.storage.local
      .set({ [SCHEDULES_KEY]: normalizeScheduleRanges(message.schedules) })
      .then(async () => {
        await ensureScheduleAlarm();
        await runScheduleCheck();
        sendResponse({ success: true });
      })
      .catch((error) => sendResponse({ success: false, error: error.message }));

    return true;
  }

  if (message.type === 'GET_WHITELIST') {
    getWhitelist()
      .then((domains) => sendResponse({ success: true, domains }))
      .catch((error) => sendResponse({ success: false, error: error.message }));

    return true;
  }

  if (message.type === 'SAVE_WHITELIST') {
    saveWhitelist(message.domains)
      .then((domains) => sendResponse({ success: true, domains }))
      .catch((error) => sendResponse({ success: false, error: error.message }));

    return true;
  }

  if (message.type === 'GET_DISTRACTION_SCORES') {
    getBlockHistory()
      .then((history) => sendResponse({ success: true, ...buildDistractionScores(history) }))
      .catch((error) => sendResponse({ success: false, error: error.message }));

    return true;
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-focus-mode') return;

  toggleFocusMode().catch((error) => {
    console.error('Failed to toggle Focus Mode via shortcut:', error);
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SCHEDULE_ALARM_NAME) return;

  runScheduleCheck().catch((error) => {
    console.error('Failed to run schedule check:', error);
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes[SCHEDULES_KEY]) {
    ensureScheduleAlarm().catch(console.error);
  }

  if (changes[WHITELIST_KEY]) {
    syncWhitelistEffects().catch(console.error);
  }
});

chrome.runtime.onInstalled.addListener(restoreFocusMode);
chrome.runtime.onStartup.addListener(restoreFocusMode);
