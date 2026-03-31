/**
 * Built-in archetypes shared across Liminal.
 * Each has a name, i18n key, short description, and a small SVG avatar.
 */

export const BUILT_IN_ARCHETYPES = [
  {
    value: 'Auto',
    key: 'archetype.auto',
    description: 'A blended voice drawn from your active archetypes',
    color: '#888',
    icon: 'auto',
  },
  {
    value: 'Zen',
    key: 'archetype.zen',
    description: 'Stillness, presence, and the wisdom of letting go',
    color: '#5a8a6e',
    icon: 'zen',
  },
  {
    value: 'Jungian',
    key: 'archetype.jungian',
    description: 'Shadow work, archetypes, and the unconscious',
    color: '#6b5b8a',
    icon: 'jungian',
  },
  {
    value: 'Stoic',
    key: 'archetype.stoic',
    description: 'Virtue, discipline, and what is within your control',
    color: '#7a7a7a',
    icon: 'stoic',
  },
  {
    value: 'Somatic',
    key: 'archetype.somatic',
    description: 'The body keeps the score — felt sense and embodiment',
    color: '#a06848',
    icon: 'somatic',
  },
  {
    value: 'Taoist',
    key: 'archetype.taoist',
    description: 'Flow, wu wei, and harmony with the way of things',
    color: '#4a7a8a',
    icon: 'taoist',
  },
  {
    value: 'Sufi',
    key: 'archetype.sufi',
    description: 'The heart\'s path — love, devotion, and the divine within',
    color: '#8a5a6a',
    icon: 'sufi',
  },
  {
    value: 'Direct Friend',
    key: 'archetype.directFriend',
    description: 'Straight talk from someone who cares',
    color: '#b07040',
    icon: 'friend',
  },
  {
    value: 'Alan Watts',
    key: 'archetype.alanWatts',
    description: 'Playful philosopher bridging East and West — "You are the universe experiencing itself"',
    color: '#5a6a4a',
    icon: 'watts',
  },
];

/** Just the name strings (without Auto) for backend/active lists */
export const ARCHETYPE_NAMES = BUILT_IN_ARCHETYPES
  .filter(a => a.value !== 'Auto')
  .map(a => a.value);

/** Find a built-in archetype by value */
export function getArchetype(value) {
  return BUILT_IN_ARCHETYPES.find(a => a.value === value);
}

/** Check if an archetype is built-in */
export function isBuiltIn(value) {
  return BUILT_IN_ARCHETYPES.some(a => a.value === value);
}
