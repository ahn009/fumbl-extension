// popup.js — extension popup logic. Reads/writes chrome.storage.local and keeps the UI in sync.

const DEFAULT_MODE = 'subtle';
const FREE_DAILY_LIMIT = 2;
const CHECKOUT_URL = 'https://fumbl.com/checkout';

const $ = (sel) => document.querySelector(sel);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function getState() {
  const s = await chrome.storage.local.get([
    'preferredMode', 'dailyCount', 'lastResetDate', 'isPro', 'history',
  ]);
  const dailyCount = s.lastResetDate === todayISO() ? (s.dailyCount ?? 0) : 0;
  return {
    preferredMode: s.preferredMode || DEFAULT_MODE,
    dailyCount,
    isPro: s.isPro === true,
    historyLen: Array.isArray(s.history) ? s.history.length : 0,
  };
}

function setActiveMode(mode) {
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
    b.setAttribute('aria-selected', String(b.dataset.mode === mode));
  });
}

function renderUsage(state) {
  const line = $('#usage-line');
  const meter = $('#usage-meter');
  const upgrade = $('#upgrade-btn');

  if (state.isPro) {
    line.textContent = 'Pro plan active';
    meter.style.width = '100%';
    meter.removeAttribute('data-zero');
    upgrade.hidden = true;
    return;
  }

  const used = Math.min(FREE_DAILY_LIMIT, state.dailyCount);
  const left = Math.max(0, FREE_DAILY_LIMIT - used);
  line.textContent = `${left} free rewrite${left === 1 ? '' : 's'} left today`;
  meter.style.width = `${(used / FREE_DAILY_LIMIT) * 100}%`;
  meter.toggleAttribute('data-zero', left === 0);
  upgrade.hidden = false;
}

function renderHistory(state) {
  $('#history-count').textContent = `${state.historyLen} saved undo snapshot${state.historyLen === 1 ? '' : 's'}`;
}

async function refresh() {
  const state = await getState();
  setActiveMode(state.preferredMode);
  renderUsage(state);
  renderHistory(state);
}

document.addEventListener('DOMContentLoaded', async () => {
  $('#version').textContent = `v${chrome.runtime.getManifest().version}`;
  await refresh();

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode;
      setActiveMode(mode);
      await chrome.storage.local.set({ preferredMode: mode });
      await refresh();
    });
  });

  $('#upgrade-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: CHECKOUT_URL });
  });

  $('#clear-history').addEventListener('click', async () => {
    const all = await chrome.storage.local.get(null);
    const undoKeys = Object.keys(all).filter(k => k.startsWith('undo_'));
    await chrome.storage.local.remove([...undoKeys, 'history', 'last_original', 'apiKey']);
    await refresh();
  });

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') refresh();
  });
});
