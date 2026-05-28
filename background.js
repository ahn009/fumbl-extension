// background.js — MV3 service worker. Runs as ES module (see manifest).
//
// Responsibilities:
//   A) HUMANIZE message: quota → backend OpenRouter proxy → imperfections →
//      ceo lowercase safety net → counter increment.
//   B) Right-click context menu humanizer.
//
// Privacy: never store or log email text. Only counters + flags.

import applyRandomImperfection from './imperfections.js';

const FREE_DAILY_LIMIT = 2;
// Change this to your deployed backend before publishing.
const BACKEND_BASE_URL = 'http://localhost:3000';
const SENSITIVE_TYPES = new Set(['APOLOGY', 'LEGAL', 'HR', 'MEDICAL']);

// --- Helpers ----------------------------------------------------------------

function todayISO() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

async function getQuotaState() {
  const keys = ['dailyCount', 'lastResetDate', 'isPro'];
  const s = await chrome.storage.local.get(keys);
  return {
    dailyCount: s.dailyCount ?? 0,
    lastResetDate: s.lastResetDate ?? null,
    isPro: s.isPro === true,
  };
}

async function rolloverIfNewDay(state) {
  const today = todayISO();
  if (state.lastResetDate !== today) {
    state.dailyCount = 0;
    state.lastResetDate = today;
    await chrome.storage.local.set({ dailyCount: 0, lastResetDate: today });
  }
  return state;
}

async function callBackend(path, payload) {
  const res = await fetch(`${BACKEND_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data.error || `HTTP_${res.status}` };
  }
  return data;
}

// --- HUMANIZE handler -------------------------------------------------------

async function handleHumanize({ text, mode, voiceProfile, force }) {
  if (!text || !mode) return { error: 'BAD_REQUEST' };

  let state = await getQuotaState();
  state = await rolloverIfNewDay(state);

  const isFree = !state.isPro;
  if (isFree && state.dailyCount >= FREE_DAILY_LIMIT) {
    return { error: 'LIMIT_REACHED' };
  }

  const resp = await callBackend('/proxy/humanize', {
    text,
    mode,
    voiceProfile,
    force: force === true,
  });

  if (resp.warning === 'SENSITIVE_EMAIL' && !force) {
    const emailType = String(resp.emailType || '').toUpperCase();
    return { warning: 'SENSITIVE_EMAIL', emailType: SENSITIVE_TYPES.has(emailType) ? emailType : 'OTHER' };
  }
  if (resp.error) return resp;

  let result = resp.result || '';
  result = applyRandomImperfection(result, mode);
  if (mode === 'ceo') result = result.toLowerCase();

  if (isFree) {
    await chrome.storage.local.set({ dailyCount: state.dailyCount + 1 });
  }

  return { result, provider: resp.provider };
}

// --- Message bus ------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'HUMANIZE') {
    handleHumanize(msg).then(sendResponse).catch(e => sendResponse({ error: 'FATAL', message: String(e) }));
    return true; // async response
  }
  return false;
});

// --- Context menu -----------------------------------------------------------

const MENU_ID = 'fumbl-humanize-selection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Fumbl — Humanize selection',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: 'CONTEXT_HUMANIZE',
    text: info.selectionText ?? '',
  });
});
