// prompts.js — system prompt builder for all three rewrite modes.
// Exports buildSystemPrompt(mode, voiceProfile?) → string.

const SHARED_RULES = `SHARED RULES (apply in every mode):
- Remove all em dashes (—). Replace each with a comma or a period.
- Remove "not only X but also Y" constructions.
- Remove these openers if present: "I hope this email finds you well", "I wanted to reach out", "As per our conversation", "Please do not hesitate to reach out", "I am writing to".
- Return ONLY the rewritten email. No preamble. No quotation marks. No explanation. No "Here is the rewritten email:" header.
- Preserve ALL core information and key facts. Do not invent details.`;

const SUBTLE_RULES = `MODE: SUBTLE
- Convert contractions: "I am" -> "I'm", "do not" -> "don't", "cannot" -> "can't", "will not" -> "won't", "it is" -> "it's".
- Remove filler words: "just", "very", "really", "basically", "actually".
- Insert exactly ONE small typo in the FIRST sentence only. Examples: transposed letters ("recieve" for "receive"), a doubled letter ("emaiil"), or a swapped pair ("hte" for "the"). Just one — subtle.
- Keep the professional tone. Do not change sentence structure.`;

const HUMAN_RULES = `MODE: HUMAN (applies SUBTLE rules first, then these)
- Break long sentences into shorter ones.
- Replace formal words with casual ones: "utilize" -> "use", "prior to" -> "before", "regarding" -> "about", "commence" -> "start", "terminate" -> "end".
- Insert ONE typo in the MIDDLE of the email (not the first paragraph, not the last paragraph).
- Replace "Best regards" / "Kind regards" / "Sincerely" with "thanks" or with just the sender's first name.`;

const CEO_RULES = `MODE: CEO
- The entire email must be lowercase. Zero capital letters anywhere.
- Maximum 4 sentences total. Cut everything that is not essential.
- Keep only the core request or the key piece of information.
- No sign-off and no signature.
- Append, on a new line at the end, exactly: Sent from my iPhone
- You may optionally insert 1 small typo anywhere in the body.`;

function modeBlock(mode) {
  switch (mode) {
    case 'subtle': return SUBTLE_RULES;
    case 'human':  return HUMAN_RULES;
    case 'ceo':    return CEO_RULES;
    default:       throw new Error(`Unknown mode: ${mode}`);
  }
}

function voiceBlock(voiceProfile) {
  if (!voiceProfile) return '';
  const phrases = voiceProfile.commonPhrases?.join(', ') ?? '';
  return `\n\nUSER VOICE PROFILE: ${voiceProfile.summary}
Key patterns: avg sentence length ${voiceProfile.avgSentenceLength} words, sign-off: ${voiceProfile.signOff}, vocabulary: ${phrases}`;
}

export function buildSystemPrompt(mode, voiceProfile = null) {
  return `${SHARED_RULES}\n\n${modeBlock(mode)}${voiceBlock(voiceProfile)}`;
}
