// imperfections.js — post-rewrite humanizing typo library.
// Default export: applyRandomImperfection(text, mode) → string.
//
// Each imperfection function takes the full text and returns either a
// modified string or null when it cannot apply (e.g. target token not
// present). The picker keeps trying types until one applies, then stops.
//
// Word-targeted imperfections operate on a "middle" word index — never
// the first word, never the last word — per the spec.

function tokenize(text) {
  // Split into [token, separator] pairs so we can rebuild whitespace exactly.
  const re = /(\s+)/g;
  const parts = text.split(re);
  // parts is [word, ws, word, ws, ...]; words at even indices.
  return parts;
}

function detokenize(parts) {
  return parts.join('');
}

function wordIndices(parts) {
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0 && parts[i].length > 0) out.push(i);
  }
  return out;
}

function pickMiddleWordIndex(parts) {
  const idxs = wordIndices(parts);
  if (idxs.length < 3) return -1;
  // Drop first + last word; pick uniformly from the rest.
  const middle = idxs.slice(1, -1);
  return middle[Math.floor(Math.random() * middle.length)];
}

function rand(n) { return Math.floor(Math.random() * n); }

// --- Imperfection types -----------------------------------------------------

function transposeAdjacent(text) {
  const parts = tokenize(text);
  const idx = pickMiddleWordIndex(parts);
  if (idx < 0) return null;
  const w = parts[idx];
  const letters = w.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 4) return null;
  // Find a position inside the alpha core to swap.
  const start = w.search(/[a-zA-Z]/);
  const end = w.length - [...w].reverse().findIndex(c => /[a-zA-Z]/.test(c));
  const span = end - start;
  if (span < 4) return null;
  const p = start + 1 + rand(span - 2); // avoid first + last alpha
  const swapped = w.slice(0, p) + w[p + 1] + w[p] + w.slice(p + 2);
  if (swapped === w) return null;
  parts[idx] = swapped;
  return detokenize(parts);
}

function doubleEndLetter(text) {
  const parts = tokenize(text);
  const idx = pickMiddleWordIndex(parts);
  if (idx < 0) return null;
  const w = parts[idx];
  // Identify trailing alpha run.
  const m = w.match(/^(.*?)([a-zA-Z]+)([^a-zA-Z]*)$/);
  if (!m || m[2].length < 3) return null;
  const last = m[2][m[2].length - 1];
  parts[idx] = m[1] + m[2] + last + m[3];
  return detokenize(parts);
}

function dropApostrophe(text) {
  const re = /\b([A-Za-z]+)'(t|s|re|ve|ll|d|m)\b/;
  if (!re.test(text)) return null;
  return text.replace(re, '$1$2');
}

function lowercaseMidI(text) {
  // Replace a capital I that is mid-sentence (preceded by a space and a
  // lowercase word) with lowercase i. Skip the very first character.
  const re = / I( |')/;
  if (!re.test(text)) return null;
  return text.replace(re, ' i$1');
}

function swapTheirThere(text) {
  const re = /\btheir\b/i;
  const re2 = /\bthere\b/i;
  if (re.test(text)) return text.replace(re, m => m[0] === 'T' ? 'There' : 'there');
  if (re2.test(text)) return text.replace(re2, m => m[0] === 'T' ? 'Their' : 'their');
  return null;
}

function swapYourYoure(text) {
  const re = /\byour\b/i;
  const re2 = /\byou're\b/i;
  if (re.test(text)) return text.replace(re, m => m[0] === 'Y' ? "You're" : "you're");
  if (re2.test(text)) return text.replace(re2, m => m[0] === 'Y' ? 'Your' : 'your');
  return null;
}

function spaceBeforePunct(text) {
  // Pick a random eligible punctuation occurrence (.,!?;:) and add a space before it.
  const matches = [...text.matchAll(/([^\s])([.,!?;:])/g)];
  if (matches.length < 2) return null; // skip if too rare to look natural
  const m = matches[rand(matches.length - 1)]; // not the final one (often end)
  const i = m.index + 1;
  return text.slice(0, i) + ' ' + text.slice(i);
}

function missSpaceBetweenWords(text) {
  const parts = tokenize(text);
  const idxs = wordIndices(parts);
  if (idxs.length < 4) return null;
  // Pick a separator that is a single space, not first or last.
  const candidates = [];
  for (let i = 1; i < idxs.length - 2; i++) {
    const sepIdx = idxs[i] + 1;
    if (parts[sepIdx] === ' ') candidates.push(sepIdx);
  }
  if (!candidates.length) return null;
  const sep = candidates[rand(candidates.length)];
  parts[sep] = '';
  return detokenize(parts);
}

function lowercaseFirstOfSentence(text) {
  // Lowercase the first letter of a non-first sentence.
  const sentences = text.split(/([.!?]\s+)/);
  // sentences = [s0, sep0, s1, sep1, s2, ...]. Sentence text at even idx.
  const candidates = [];
  for (let i = 2; i < sentences.length; i += 2) {
    if (sentences[i] && /^[A-Z]/.test(sentences[i])) candidates.push(i);
  }
  // Skip the last sentence too (often the sign-off).
  candidates.pop();
  if (!candidates.length) return null;
  const ci = candidates[rand(candidates.length)];
  sentences[ci] = sentences[ci][0].toLowerCase() + sentences[ci].slice(1);
  return sentences.join('');
}

function dropFinalE(text) {
  const parts = tokenize(text);
  const idx = pickMiddleWordIndex(parts);
  if (idx < 0) return null;
  const w = parts[idx];
  const m = w.match(/^(.*?[a-zA-Z]{3,})e([^a-zA-Z]*)$/);
  if (!m) return null;
  parts[idx] = m[1] + m[2];
  return detokenize(parts);
}

function swapItsIts(text) {
  const re = /\bit's\b/;
  const re2 = /\bits\b/;
  if (re.test(text)) return text.replace(re, 'its');
  if (re2.test(text)) return text.replace(re2, "it's");
  return null;
}

function dropDoubleLetter(text) {
  const parts = tokenize(text);
  const idx = pickMiddleWordIndex(parts);
  if (idx < 0) return null;
  const w = parts[idx];
  const m = w.match(/([a-zA-Z])\1/);
  if (!m) return null;
  const i = m.index;
  parts[idx] = w.slice(0, i) + w[i] + w.slice(i + 2);
  return detokenize(parts);
}

function swapToToo(text) {
  const re = /\btoo\b/;
  const re2 = /\bto\b/;
  if (re.test(text)) return text.replace(re, 'to');
  if (re2.test(text)) return text.replace(re2, 'too');
  return null;
}

function swapThenThan(text) {
  const re = /\bthan\b/i;
  const re2 = /\bthen\b/i;
  if (re.test(text)) return text.replace(re, m => m[0] === 'T' ? 'Then' : 'then');
  if (re2.test(text)) return text.replace(re2, m => m[0] === 'T' ? 'Than' : 'than');
  return null;
}

function duplicateSmallWord(text) {
  // Duplicate a short common word once, mid-text.
  const parts = tokenize(text);
  const idxs = wordIndices(parts);
  if (idxs.length < 6) return null;
  const middle = idxs.slice(2, -2);
  const small = middle.filter(i => /^(the|a|of|to|and|in|is|that|it)$/i.test(parts[i]));
  if (!small.length) return null;
  const i = small[rand(small.length)];
  parts[i] = parts[i] + ' ' + parts[i];
  return detokenize(parts);
}

function tehForThe(text) {
  const re = /\bthe\b/;
  if (!re.test(text)) return null;
  return text.replace(re, 'teh');
}

function recieveForReceive(text) {
  const re = /\breceive\b/i;
  if (!re.test(text)) return null;
  return text.replace(re, m => m[0] === 'R' ? 'Recieve' : 'recieve');
}

const TYPES = [
  transposeAdjacent,
  doubleEndLetter,
  dropApostrophe,
  lowercaseMidI,
  swapTheirThere,
  swapYourYoure,
  spaceBeforePunct,
  missSpaceBetweenWords,
  lowercaseFirstOfSentence,
  dropFinalE,
  swapItsIts,
  dropDoubleLetter,
  swapToToo,
  swapThenThan,
  duplicateSmallWord,
  tehForThe,
  recieveForReceive,
];

function applyRandomImperfection(text, mode) {
  if (mode === 'subtle') return text; // Claude already inserted the typo.
  if (mode !== 'human' && mode !== 'ceo') return text;
  if (!text || typeof text !== 'string') return text;

  // Try each type in random order until one applies.
  const order = TYPES.map((_, i) => i).sort(() => Math.random() - 0.5);
  for (const i of order) {
    const out = TYPES[i](text);
    if (out && out !== text) return out;
  }
  return text;
}

export default applyRandomImperfection;
