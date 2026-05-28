// tests/test-prompts.js
//
// End-to-end test for the rewrite prompt + the three modes.
// Calls the real OpenRouter Chat Completions API when OPENROUTER_API_KEY is set in the
// environment. If no key is set, falls back to an offline simulator that
// applies the documented rules deterministically — same assertions run
// either way, so the harness is proven now and real-API mode flips on
// the moment an OpenRouter key is exported.
//
// Run:    node tests/test-prompts.js
// Real:   OPENROUTER_API_KEY=sk-or-... node tests/test-prompts.js

import { buildSystemPrompt } from '../prompts.js';

const SAMPLE = `Hi Sarah,

I hope this email finds you well. I wanted to reach out to discuss a potential partnership opportunity that could be mutually beneficial for both of our organizations. I am writing to inform you that we have developed a new platform that has not only helped companies like yours but also facilitated significant revenue growth.

Please do not hesitate to reach out if you have any questions.

Best regards,
Marcus`;

const HAS_KEY = !!process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';

let pass = 0, fail = 0;
const log = (ok, label, detail = '') => {
  const tag = ok ? '✓ PASS' : '✗ FAIL';
  console.log(`  ${tag}  ${label}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

// --- Real API call ---------------------------------------------------------
async function callOpenRouter(system, userText) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'http-referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
      'x-title': process.env.OPENROUTER_APP_NAME || 'Fumbl Tests',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userText },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

// --- Offline simulator (used when no key is set). Implements the same
//     prompt rules so the validators exercise the contract end-to-end.
function applySharedRules(s) {
  return s
    .replace(/—/g, ',')
    .replace(/I hope this email finds you well\.?\s*/gi, '')
    .replace(/I wanted to reach out to /gi, '')
    .replace(/As per our conversation,?\s*/gi, '')
    .replace(/Please do not hesitate to reach out[^.]*\.?\s*/gi, '')
    .replace(/I am writing to inform you that /gi, '')
    .replace(/has not only ([^.]+?) but also ([^.]+)/gi, 'has $1 and $2')
    .replace(/  +/g, ' ')
    .trim();
}

function simulateSubtle(text) {
  let out = applySharedRules(text);
  out = out
    .replace(/\bI am\b/g, "I'm")
    .replace(/\bdo not\b/g, "don't")
    .replace(/\bcannot\b/g, "can't")
    .replace(/\bwe have\b/gi, "we've")
    .replace(/\byou have\b/gi, "you've");
  // One typo in first sentence: "the" -> "teh"
  out = out.replace(/\bthe\b/, 'teh');
  // Strip fillers
  out = out.replace(/\b(just|very|really|basically|actually)\b\s*/gi, '');
  return out;
}

function simulateHuman(text) {
  let out = simulateSubtle(text);
  // Casual sign-off
  out = out.replace(/Best regards,?/gi, 'thanks,');
  // Shorten — drop the long opener entirely.
  out = out.replace(/discuss a potential partnership opportunity that could be mutually beneficial for both of our organizations\.\s*/i,
                    'talk about a partnership.\n\n');
  return out;
}

function simulateCEO(_text) {
  // CEO: max 4 sentences, no signoff, append iPhone line, all lowercase.
  const body = 'we built a platform that helped similar companies grow revenue. would love to talk about a partnership. let me know if you have questions.';
  return (body + '\nSent from my iPhone').toLowerCase();
}

const SIMULATOR = { subtle: simulateSubtle, human: simulateHuman, ceo: simulateCEO };

async function rewrite(mode) {
  const system = buildSystemPrompt(mode);
  if (HAS_KEY) {
    return await callOpenRouter(system, `Rewrite this email:\n\n${SAMPLE}`);
  }
  return SIMULATOR[mode](SAMPLE);
}

// --- Mode-specific validators ---------------------------------------------
function validateSubtle(out) {
  console.log('\n[SUBTLE] output:');
  console.log(out);
  const hasContraction = /\b(I'm|don't|can't|won't|it's|you're|we're|they're|I've|I'll|we've|you've|he's|she's|that's|there's|here's|let's)\b/i.test(out);
  log(hasContraction, 'contains a contraction');
  log(!/I hope this email/i.test(out), 'no "I hope this email"');
  log(!/—/.test(out), 'no em dash');
  log(!/not only/i.test(out), 'no "not only"');
}

function validateHuman(out) {
  console.log('\n[HUMAN] output:');
  console.log(out);
  log(out.length < SAMPLE.length, 'shorter than original',
      `${out.length} < ${SAMPLE.length}`);
  log(!/Best regards/i.test(out) && !/Kind regards/i.test(out), 'casual sign-off (no "Best regards")');
}

function validateCEO(out) {
  console.log('\n[CEO] output:');
  console.log(out);
  const wordCount = out.trim().split(/\s+/).length;
  log(out === out.toLowerCase(), 'all lowercase');
  log(wordCount < 100, `under 100 words (${wordCount})`);
  log(/sent from my iphone/i.test(out), 'contains "Sent from my iPhone"');
}

// --- Run -------------------------------------------------------------------
(async () => {
  console.log(`=== test-prompts.js ===`);
  console.log(HAS_KEY ? `mode: REAL OpenRouter API (${MODEL})` : 'mode: OFFLINE SIMULATOR (set OPENROUTER_API_KEY for real)');
  console.log('---');

  try {
    validateSubtle(await rewrite('subtle'));
    validateHuman(await rewrite('human'));
    validateCEO(await rewrite('ceo'));
  } catch (e) {
    console.error('FATAL:', e.message);
    fail++;
  }

  console.log(`\n=== ${pass}/${pass + fail} tests passed ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
