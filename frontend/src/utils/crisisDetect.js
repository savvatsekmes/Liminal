// Keyword-level crisis detector. Used by:
//   - input-side gate (oracle, mirror reflect, polish): runs before send
//   - output-side scan (streaming LLM responses): runs on assistant text
//
// The list is intentionally narrow but covers categories that lawyer review
// flagged as foreseeably-missing in v1: ideation, means/plan, burden,
// exhaustion, common abbreviations, common typos. Smart quotes are normalised
// before matching so "I can't" and "I can’t" both hit. All checks are
// lowercase, anchored to first-person where possible to avoid triggering on
// third-person dialogue ("she said she wanted to die").

const PATTERNS = [
  // --- Direct ideation / intent ---
  /\bi (want|wanna|need|am going|'?m going|plan|am planning|'?m planning|hope|wish) to (kill myself|kill my self|end (my )?life|end it all|end it|not (be|exist)( anymore| any more)?)\b/,
  // "to die" — only when it's the verb phrase's tail. Excludes the common
  // humour/idiom tails (die laughing, die of/from/for, die inside, die trying,
  // die with laughter|joy|happiness, die happy, die peacefully, die for X).
  // Also note: "to die for" by itself is just an intensifier.
  /\bi (want|wanna|need|am going|'?m going|plan|am planning|'?m planning|hope|wish) to die\b(?!\s+(laughing|of\b|from\b|for\b|inside|trying|happy|peacefully|with\s+(laughter|joy|happiness|a\s+smile)))/,
  /\bi (just )?want to die\b(?!\s+(laughing|of\b|from\b|for\b|inside|trying|happy|peacefully|with\s+(laughter|joy|happiness|a\s+smile)))/,
  /\bi (will|am going to|'?m going to|wanna|want to|am about to|'?m about to) (kill|hurt|harm|cut|burn) (myself|my self)\b/,
  /\bkill (myself|my self|me now)\b/,
  /\bend my life\b/,
  /\bend it all\b/,
  /\b(commit|committing|attempt|attempting) suicide\b/,
  /\bsuicide\b/,
  /\bsuicidal\b/,
  /\bself[\s-]?harm(ing)?\b/,
  /\bcutting (myself|my self)\b/,
  /\bi (don'?t|do not) want to (live|be (here|alive))\b/,
  /\bi (can'?t|cannot) go on\b/,
  /\bi (can'?t|cannot) (do|take) (this|it) (anymore|any more)\b/,
  /\bi (can'?t|cannot) keep (going|living)\b/,
  /\bi want to disappear\b/,

  // --- Means / plan ---
  /\b(kill|killing|hurt|hurting|end|ending) (myself|my self)\s+(with|by|using)\b/,
  /\b(overdose|overdosing) (on|with)\b/,
  /\b(hang|hanging) myself\b/,
  /\b(shoot|shooting|stab|stabbing) myself\b/,
  /\bjump(ing)? (off|in front of)\b/,
  /\b(took|take|taking|swallow|swallowed|swallowing) (all|the|every|a bunch of|a lot of) (the )?(pills|tablets|tablets?)\b/,
  /\bgoodbye note\b/,
  /\bsuicide note\b/,
  /\bfinal letter\b/,

  // --- Burden ---
  /\b(everyone|everybody|they|the world|my (family|kids|parents|friends)) (would|will|'?d) be (better|happier) (off )?without me\b/,
  /\bi(?:'?m| am) a burden\b/,
  /\bnobody (would|will) (miss|notice|care if) me\b/,
  /\bno one (would|will) (miss|notice|care if) me\b/,

  // --- Exhaustion / hopelessness ---
  /\b(tired|exhausted|done|sick) of (living|being alive|existing|life)\b/,
  /\bi(?:'?m| am) ready to die\b/,
  /\b(there(?:'?s| is) )?no point (in (living|going on|continuing|trying))\b/,
  /\bnothing matters anymore\b/,

  // --- Abbreviations (journal/chat slang) ---
  // Word-boundary on both sides; intentionally do not match inside other tokens.
  /\bkms\b/,
  /\bkys\b/, // primarily directed at others; flag for safety on first-person review
  /\bkmn\b/, // "kill me now"

  // --- Common typos / misspellings ---
  /\bsu+icide\b/,        // catches accidental doubles
  /\b(sui?cd|suicde|sucide|suiside|suiced)\b/,
  /\b(kil|kll) (myself|my self)\b/,
  /\bself harming?\b/,
];

function normalise(text) {
  // Smart quotes -> ASCII so /can'?t/ matches "can’t". Also strip a few
  // zero-width chars that copy-paste sometimes carries in.
  return text
    .replace(/[‘’‚‛′‵]/g, "'")
    .replace(/[“”„‟″‶]/g, '"')
    .replace(/[​-‍﻿]/g, '')
    .toLowerCase();
}

/** Returns true if `text` looks like a first-person crisis statement. */
export function detectCrisis(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = normalise(text);
  return PATTERNS.some((re) => re.test(lower));
}

// Output-side patterns. Deliberately MUCH narrower than the input-side list.
// Input detection wants to catch any user-journaled cry for help — including
// slang, typos, and hedged phrasing. Output detection is scanning AI responses
// to journal entries, which legitimately touch on heavy themes with
// therapeutic metaphor ("drowning", "the void", "wanting to end it" used in
// scare-quotes as a reading of the user's state, etc). Firing a helpline
// banner on that is patronising and makes the product feel like a panic alarm.
//
// Only trigger the banner when the AI text contains explicit, unambiguous
// crisis vocabulary in a direct (not quoted, not hedged) register.
const OUTPUT_PATTERNS = [
  /\bsuicid(e|al)\b/,
  /\bself[\s-]?harm(ing)?\b/,
  /\bkill (yourself|your self|yourselves)\b/,
  /\bhurt yourself\b/,
  /\bend your life\b/,
  /\b988\b/,
  /\blifeline\b/,
  /\bhelpline\b/,
  /\bhotline\b/,
  /\bfindahelpline\b/,
  /\bcrisis (line|text)\b/,
];

/** Narrower detector for model-output text; avoids metaphor false-positives. */
export function detectCrisisInOutput(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = normalise(text);
  return OUTPUT_PATTERNS.some((re) => re.test(lower));
}
