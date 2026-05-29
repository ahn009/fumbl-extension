// routes/proxy.js — OpenRouter API proxy for Fumbl rewrites.
// In production this is the ONLY place the real OPENROUTER_API_KEY lives.
// Privacy rule: never log req.body.text. Counters/headers only.

const express = require('express');

const router = express.Router();

const MAX_TEXT_LEN = 10_000;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.5';
const CLASSIFIER_MODEL = process.env.OPENROUTER_CLASSIFIER_MODEL || process.env.OPENROUTER_MODEL || 'anthropic/claude-3-haiku';
const FETCH_TIMEOUT_MS = 30_000; // 30 s hard cap per OpenRouter call

const SENSITIVE_TYPES = new Set(['APOLOGY', 'LEGAL', 'HR', 'MEDICAL']);
const ALLOWED_TYPES = [
  'COLD_OUTREACH', 'FOLLOW_UP', 'RESPONSE', 'APOLOGY',
  'LEGAL', 'HR', 'MEDICAL', 'NEGOTIATION', 'PERSONAL', 'OTHER',
];
const CLASSIFIER_PROMPT =
  'Classify this email. Respond with ONLY one of these exact words, nothing else: ' +
  'COLD_OUTREACH, FOLLOW_UP, RESPONSE, APOLOGY, LEGAL, HR, MEDICAL, NEGOTIATION, PERSONAL, OTHER';

// --- In-memory rate limiter (10 req/IP/min) ----------------------------------
// buckets is pruned on every request so it cannot grow unbounded.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const buckets = new Map(); // ip -> [timestamps]

// Prune IPs that have had no requests in the last window.
function pruneBuckets() {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, times] of buckets) {
    const fresh = times.filter(t => t > cutoff);
    if (fresh.length === 0) buckets.delete(ip);
    else buckets.set(ip, fresh);
  }
}

function rateLimit(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;

  // Prune on each request (cheap — map is small for normal traffic).
  pruneBuckets();

  const arr = (buckets.get(ip) || []).filter(t => t > cutoff);
  if (arr.length >= RATE_LIMIT) {
    res.set('Retry-After', '60');
    return res.status(429).json({ error: 'RATE_LIMITED' });
  }
  arr.push(now);
  buckets.set(ip, arr);
  next();
}

// --- System prompt -----------------------------------------------------------
const SHARED_RULES = `SHARED RULES (apply in every mode):
- Remove all em dashes (—). Replace each with a comma or a period.
- Remove "not only X but also Y" constructions.
- Remove these openers if present: "I hope this email finds you well", "I wanted to reach out", "As per our conversation", "Please do not hesitate to reach out", "I am writing to".
- Return ONLY the rewritten email. No preamble. No quotation marks. No explanation. No "Here is the rewritten email:" header.
- Preserve ALL core information and key facts. Do not invent details.`;

const MODE_RULES = {
  subtle: `MODE: SUBTLE
- Convert contractions: "I am" -> "I'm", "do not" -> "don't", "cannot" -> "can't", "will not" -> "won't", "it is" -> "it's".
- Remove filler words: "just", "very", "really", "basically", "actually".
- Insert exactly ONE small typo in the FIRST sentence only.
- Keep the professional tone. Do not change sentence structure.`,
  human: `MODE: HUMAN (applies SUBTLE rules first, then these)
- Break long sentences into shorter ones.
- Replace formal words with casual words.
- Insert ONE typo in the MIDDLE of the email.
- Replace "Best regards" / "Kind regards" / "Sincerely" with "thanks" or the sender's first name.`,
  ceo: `MODE: CEO
- The entire email must be lowercase. Zero capital letters anywhere.
- Maximum 4 sentences total. Cut everything that is not essential.
- No sign-off and no signature.
- Append, on a new line at the end, exactly: Sent from my iPhone
- You may optionally insert 1 small typo anywhere in the body.`,
};

// Sanitize voiceProfile fields to prevent prompt injection.
function sanitizeString(val, maxLen = 200) {
  if (typeof val !== 'string') return '';
  return val.replace(/[\r\n]/g, ' ').slice(0, maxLen);
}

function buildSystemPrompt(mode, voiceProfile) {
  const block = MODE_RULES[mode];
  if (!block) throw new Error(`Unknown mode: ${mode}`);
  let out = `${SHARED_RULES}\n\n${block}`;

  if (voiceProfile && typeof voiceProfile === 'object') {
    const summary   = sanitizeString(voiceProfile.summary, 300);
    const signOff   = sanitizeString(voiceProfile.signOff, 50);
    const avgLen    = Number.isFinite(voiceProfile.avgSentenceLength)
      ? Math.round(voiceProfile.avgSentenceLength)
      : '?';
    const phrases   = Array.isArray(voiceProfile.commonPhrases)
      ? voiceProfile.commonPhrases.map(p => sanitizeString(p, 60)).join(', ')
      : '';

    if (summary) {
      out += `\n\nUSER VOICE PROFILE: ${summary}
Key patterns: avg sentence length ${avgLen} words, sign-off: ${signOff}, vocabulary: ${phrases}`;
    }
  }

  return out;
}

// --- OpenRouter fetch with timeout -------------------------------------------
async function callOpenRouter({ model, system, userText, maxTokens }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'http-referer': process.env.OPENROUTER_SITE_URL || process.env.BASE_URL || 'http://localhost:3000',
        'x-title': process.env.OPENROUTER_APP_NAME || 'Fumbl',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userText },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 240)}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || '';
  } finally {
    clearTimeout(timer);
  }
}

async function classifyEmail(text) {
  try {
    const out = await callOpenRouter({
      model: CLASSIFIER_MODEL,
      system: CLASSIFIER_PROMPT,
      userText: text,
      maxTokens: 16,
    });
    const tag = out.trim().toUpperCase().replace(/[^A-Z_]/g, '');
    return ALLOWED_TYPES.includes(tag) ? tag : 'OTHER';
  } catch {
    return 'OTHER';
  }
}

// --- POST /proxy/humanize ----------------------------------------------------
router.post('/humanize', rateLimit, async (req, res) => {
  const { text, mode, voiceProfile, force } = req.body || {};

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }
  if (text.length > MAX_TEXT_LEN) {
    return res.status(413).json({ error: 'TEXT_TOO_LONG', limit: MAX_TEXT_LEN });
  }
  if (!['subtle', 'human', 'ceo'].includes(mode)) {
    return res.status(400).json({ error: 'BAD_MODE' });
  }

  // No key in env: dev-mock so local UI still works.
  if (!process.env.OPENROUTER_API_KEY) {
    return res.json({
      result: `[DEV MODE] This is a test rewrite of: ${text.slice(0, 50)}...`,
      provider: 'mock',
    });
  }

  try {
    if (!force && mode !== 'subtle') {
      const emailType = await classifyEmail(text);
      if (SENSITIVE_TYPES.has(emailType)) {
        return res.json({ warning: 'SENSITIVE_EMAIL', emailType });
      }
    }

    const system = buildSystemPrompt(mode, voiceProfile);
    let result = await callOpenRouter({
      model: DEFAULT_MODEL,
      system,
      userText: `Rewrite this email:\n\n${text}`,
      maxTokens: 800,
    });
    if (mode === 'ceo') result = result.toLowerCase();
    res.json({ result, provider: 'openrouter', model: DEFAULT_MODEL });
  } catch (e) {
    // Log only error message — never the email text.
    console.error('[fumbl] proxy error:', e.message);
    const isTimeout = e.name === 'AbortError';
    res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR',
    });
  }
});

module.exports = router;
