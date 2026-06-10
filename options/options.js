import {
  MAX_SCHEDULE_RANGES,
  validateScheduleRanges,
} from '../shared/schedules.js';
import {
  MAX_WHITELIST_DOMAINS,
  validateWhitelistAddition,
} from '../shared/whitelist.js';

const scheduleList = document.getElementById('schedule-list');
const scheduleForm = document.getElementById('schedule-form');
const saveStatus = document.getElementById('save-status');

const whitelistForm = document.getElementById('whitelist-form');
const whitelistInput = document.getElementById('whitelist-input');
const whitelistStatus = document.getElementById('whitelist-status');
const whitelistList = document.getElementById('whitelist-list');
const whitelistEmpty = document.getElementById('whitelist-empty');
const whitelistCount = document.getElementById('whitelist-count');

const distractionList = document.getElementById('distraction-list');
const distractionEmpty = document.getElementById('distraction-empty');
const distractionTotal = document.getElementById('distraction-total');
const distractionDomainCount = document.getElementById('distraction-domain-count');
const distractionLegend = document.getElementById('distraction-legend');

let whitelistDomains = [];

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setInlineStatus(element, message, type = '') {
  element.textContent = message;
  element.className = type ? `inline-status inline-status--${type}` : 'inline-status';
}

function renderScheduleCard(range, index) {
  const card = document.createElement('article');
  card.className = 'schedule-card';
  card.innerHTML = `
    <div class="schedule-card__header">
      <label class="schedule-card__toggle">
        <input type="checkbox" data-field="enabled" data-index="${index}" ${range.enabled ? 'checked' : ''} />
        <span class="schedule-card__toggle-ui" aria-hidden="true"></span>
        <span class="schedule-card__title">Schedule ${index + 1}</span>
      </label>
      <span class="schedule-card__status">${range.enabled ? 'Active daily' : 'Disabled'}</span>
    </div>
    <div class="schedule-card__times">
      <label class="time-field">
        <span>Start</span>
        <input type="time" data-field="start" data-index="${index}" value="${range.start}" ${range.enabled ? '' : 'disabled'} />
      </label>
      <span class="time-separator">to</span>
      <label class="time-field">
        <span>End</span>
        <input type="time" data-field="end" data-index="${index}" value="${range.end}" ${range.enabled ? '' : 'disabled'} />
      </label>
    </div>
  `;

  return card;
}

function renderSchedules(schedules) {
  scheduleList.innerHTML = '';
  schedules.slice(0, MAX_SCHEDULE_RANGES).forEach((range, index) => {
    scheduleList.appendChild(renderScheduleCard(range, index));
  });
}

function collectSchedules() {
  const schedules = [];

  for (let index = 0; index < MAX_SCHEDULE_RANGES; index += 1) {
    const enabled = scheduleList.querySelector(`[data-field="enabled"][data-index="${index}"]`).checked;
    const start = scheduleList.querySelector(`[data-field="start"][data-index="${index}"]`).value;
    const end = scheduleList.querySelector(`[data-field="end"][data-index="${index}"]`).value;

    schedules.push({ enabled, start, end });
  }

  return schedules;
}

function setSaveStatus(message, type = '') {
  saveStatus.textContent = message;
  saveStatus.className = type ? `save-status save-status--${type}` : 'save-status';
}

function updateCardState(index, enabled) {
  const card = scheduleList.children[index];
  const status = card.querySelector('.schedule-card__status');
  const inputs = card.querySelectorAll('[data-field="start"], [data-field="end"]');

  status.textContent = enabled ? 'Active daily' : 'Disabled';
  inputs.forEach((input) => {
    input.disabled = !enabled;
  });
}

function renderWhitelist() {
  whitelistCount.textContent = `${whitelistDomains.length} / ${MAX_WHITELIST_DOMAINS} domains`;
  whitelistList.innerHTML = '';
  whitelistEmpty.hidden = whitelistDomains.length > 0;

  whitelistDomains.forEach((domain) => {
    const item = document.createElement('li');
    item.className = 'whitelist-item';
    item.innerHTML = `
      <span class="whitelist-item__domain">${escapeHtml(domain)}</span>
      <button type="button" class="button button--ghost" data-domain="${escapeHtml(domain)}" aria-label="Remove ${escapeHtml(domain)}">
        Remove
      </button>
    `;
    whitelistList.appendChild(item);
  });
}

function renderDistractionScores({ total, domains }) {
  distractionTotal.textContent = String(total);
  distractionDomainCount.textContent = String(domains.length);
  distractionList.innerHTML = '';

  const isEmpty = domains.length === 0;
  distractionEmpty.hidden = !isEmpty;
  distractionList.hidden = isEmpty;
  distractionLegend.hidden = isEmpty;

  domains.forEach((entry, index) => {
    const item = document.createElement('li');
    item.className = `distraction-item distraction-item--${entry.level}`;
    item.innerHTML = `
      <div class="distraction-item__rank">#${index + 1}</div>
      <div class="distraction-item__content">
        <span class="distraction-item__domain">${escapeHtml(entry.domain)}</span>
        <div class="distraction-item__meta">
          <span>${entry.count} blocked</span>
          <span>Distraction share</span>
        </div>
        <div class="distraction-item__bar" aria-hidden="true">
          <div class="distraction-item__bar-fill" style="width: ${entry.score}%"></div>
        </div>
      </div>
      <div class="distraction-item__score">${entry.score}<span>%</span></div>
    `;
    distractionList.appendChild(item);
  });
}

async function loadDistractionScores() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_DISTRACTION_SCORES' });

  if (!response?.success) {
    distractionEmpty.hidden = false;
    distractionEmpty.textContent = 'Could not load distraction scores.';
    distractionList.hidden = true;
    distractionLegend.hidden = true;
    return;
  }

  renderDistractionScores(response);
}

async function persistWhitelist(domains, successMessage = '') {
  const response = await chrome.runtime.sendMessage({
    type: 'SAVE_WHITELIST',
    domains,
  });

  if (!response?.success) {
    throw new Error(response?.error || 'Failed to save whitelist');
  }

  whitelistDomains = response.domains;
  renderWhitelist();

  if (successMessage) {
    setInlineStatus(whitelistStatus, successMessage, 'success');
  }
}

scheduleList.addEventListener('change', (event) => {
  const target = event.target;

  if (!(target instanceof HTMLInputElement) || target.dataset.field !== 'enabled') return;

  updateCardState(Number(target.dataset.index), target.checked);
});

scheduleForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const schedules = collectSchedules();
  const validation = validateScheduleRanges(schedules);

  if (!validation.valid) {
    setSaveStatus(validation.error, 'error');
    return;
  }

  setSaveStatus('Saving...');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_SCHEDULES',
      schedules,
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Failed to save schedules');
    }

    setSaveStatus('Schedules saved. They will run daily at the times you set.', 'success');
  } catch (error) {
    setSaveStatus(error.message, 'error');
  }
});

whitelistForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const validation = validateWhitelistAddition(whitelistInput.value, whitelistDomains);

  if (!validation.valid) {
    setInlineStatus(whitelistStatus, validation.error, 'error');
    return;
  }

  setInlineStatus(whitelistStatus, 'Adding domain...');

  try {
    await persistWhitelist([...whitelistDomains, validation.domain], `${validation.domain} added to whitelist.`);
    whitelistInput.value = '';
    whitelistInput.focus();
  } catch (error) {
    setInlineStatus(whitelistStatus, error.message, 'error');
  }
});

whitelistList.addEventListener('click', async (event) => {
  const target = event.target;

  if (!(target instanceof HTMLButtonElement) || !target.dataset.domain) return;

  const domain = target.dataset.domain;

  setInlineStatus(whitelistStatus, 'Removing domain...');

  try {
    await persistWhitelist(
      whitelistDomains.filter((entry) => entry !== domain),
      `${domain} removed from whitelist.`
    );
  } catch (error) {
    setInlineStatus(whitelistStatus, error.message, 'error');
  }
});

async function loadSchedules() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_SCHEDULES' });

  if (!response?.success) {
    setSaveStatus('Could not load schedules.', 'error');
    return;
  }

  renderSchedules(response.schedules);
}

async function loadWhitelist() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_WHITELIST' });

  if (!response?.success) {
    setInlineStatus(whitelistStatus, 'Could not load whitelist.', 'error');
    return;
  }

  whitelistDomains = response.domains;
  renderWhitelist();
}

loadSchedules();
loadWhitelist();
loadDistractionScores();
