// tests/test-imperfections.js
//
// Run applyRandomImperfection() N times on the same sample, verify each
// run produced a change, the change is small, and dump a distribution of
// which imperfection landed.
//
// Run: node tests/test-imperfections.js

import applyRandomImperfection from '../imperfections.js';

const SAMPLE = `Hi Sarah, I am writing to confirm our meeting tomorrow afternoon at 3pm. Please let me know if you need to reschedule. Their office is at 5th avenue near the bridge. Thanks, Alex`;

const N = 50;
const MAX_LEN_DELTA = 5; // characters

let pass = 0, fail = 0;
const log = (ok, label, detail = '') => {
  console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

// Heuristic detector — given an input/output pair, label the imperfection.
function classify(orig, out) {
  if (out === orig) return 'NONE';
  if (orig.replace(/'/g, '') === out) return 'dropped-apostrophe';
  if (out.includes(' .') || out.includes(' ,') || out.includes(' !') || out.includes(' ?')) return 'space-before-punct';
  if (/\bteh\b/.test(out) && !/\bteh\b/.test(orig)) return 'teh-for-the';
  if (/\brecieve\b/i.test(out) && !/\brecieve\b/i.test(orig)) return 'recieve-for-receive';
  if (/\b(too|to)\b/.test(out) && /\bto\b/.test(orig) && !/\bto\b/.test(out)) return 'to-too-swap';
  if (/\bthen\b/.test(out) && /\bthan\b/.test(orig)) return 'then-than-swap';
  if (/\bthan\b/.test(out) && /\bthen\b/.test(orig)) return 'then-than-swap';
  if (/\bthere\b/i.test(out) && !/\bthere\b/i.test(orig)) return 'their-there-swap';
  if (/\btheir\b/i.test(out) && !/\btheir\b/i.test(orig)) return 'their-there-swap';
  if (/\byou're\b/i.test(out) && !/\byou're\b/i.test(orig)) return 'your-youre-swap';
  if (/\byour\b/i.test(out) && !/\byour\b/i.test(orig)) return 'your-youre-swap';
  if (/\bits\b/.test(out) && /\bit's\b/.test(orig)) return 'its-its-swap';
  if (/\bit's\b/.test(out) && /\bits\b/.test(orig)) return 'its-its-swap';
  if (out.length === orig.length + 1) {
    // Extra letter somewhere.
    return 'doubled-letter';
  }
  if (out.length === orig.length - 1) return 'dropped-letter';
  if (out.length === orig.length) {
    // Same length: transpose, lowercase tweak, or word swap of equal length.
    if (out.toLowerCase() === orig.toLowerCase()) return 'lowercase-tweak';
    return 'transpose';
  }
  // Short word duplication ("the the") adds 4+ chars.
  if (out.length > orig.length) return 'duplicate-word-or-other';
  return 'other';
}

const dist = {};
let allChanged = true;
let allSmall = true;

for (let i = 0; i < N; i++) {
  const out = applyRandomImperfection(SAMPLE, 'human');
  if (out === SAMPLE) allChanged = false;
  const delta = Math.abs(out.length - SAMPLE.length);
  if (delta > MAX_LEN_DELTA) allSmall = false;
  const kind = classify(SAMPLE, out);
  dist[kind] = (dist[kind] || 0) + 1;
}

log(allChanged, `output differs from input on all ${N} runs`);
log(allSmall, `length delta ≤ ${MAX_LEN_DELTA} chars on all ${N} runs`);

// CEO and subtle behave per-spec too.
const subtle = applyRandomImperfection(SAMPLE, 'subtle');
log(subtle === SAMPLE, 'subtle mode is a no-op (rewrite model inserts the typo)');

const ceo = applyRandomImperfection(SAMPLE, 'ceo');
log(ceo !== SAMPLE, 'ceo mode applies a change');

console.log('\nImperfection distribution over', N, 'runs:');
for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
  const bar = '█'.repeat(v);
  console.log(`  ${k.padEnd(28)} ${String(v).padStart(2)}  ${bar}`);
}

console.log(`\n=== ${pass}/${pass + fail} tests passed ===`);
process.exit(fail === 0 ? 0 : 1);
