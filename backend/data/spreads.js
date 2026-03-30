module.exports = [
  {
    id: 'single',
    nameKey: 'cards.spreadSingle',
    cardCount: 1,
    positions: [
      { labelKey: 'cards.positionMessage', description: 'The message for you right now' },
    ],
  },
  {
    id: 'past-present-future',
    nameKey: 'cards.spreadThreeCard',
    cardCount: 3,
    positions: [
      { labelKey: 'cards.positionPast', description: 'What has led to this moment' },
      { labelKey: 'cards.positionPresent', description: 'Where you are now' },
      { labelKey: 'cards.positionFuture', description: 'Where this is heading' },
    ],
  },
  {
    id: 'shadow-self-light',
    nameKey: 'cards.spreadShadowSelfLight',
    cardCount: 3,
    positions: [
      { labelKey: 'cards.positionShadow', description: 'What you are not seeing' },
      { labelKey: 'cards.positionSelf', description: 'Who you are in this moment' },
      { labelKey: 'cards.positionLight', description: 'What wants to emerge' },
    ],
  },
  {
    id: 'six-card',
    nameKey: 'cards.spreadSixCard',
    cardCount: 6,
    positions: [
      { labelKey: 'cards.positionPast', description: 'What has led to this moment' },
      { labelKey: 'cards.positionPresent', description: 'Where you are now' },
      { labelKey: 'cards.positionFuture', description: 'Where this is heading' },
      { labelKey: 'cards.positionConscious', description: 'What you are aware of' },
      { labelKey: 'cards.positionUnconscious', description: 'What lies beneath the surface' },
      { labelKey: 'cards.positionAdvice', description: 'The guidance offered' },
    ],
  },
  {
    id: 'celtic-cross',
    nameKey: 'cards.spreadCelticCross',
    tarotOnly: true,
    cardCount: 10,
    positions: [
      { labelKey: 'cards.positionPresent', description: 'Your current situation' },
      { labelKey: 'cards.positionChallenge', description: 'The immediate challenge or crossing' },
      { labelKey: 'cards.positionFoundation', description: 'The root cause or unconscious influence' },
      { labelKey: 'cards.positionRecentPast', description: 'What is passing away' },
      { labelKey: 'cards.positionCrown', description: 'Your conscious goal or best possible outcome' },
      { labelKey: 'cards.positionNearFuture', description: 'What is approaching' },
      { labelKey: 'cards.positionSelfImage', description: 'How you see yourself in this situation' },
      { labelKey: 'cards.positionEnvironment', description: 'External influences and other people' },
      { labelKey: 'cards.positionHopesFears', description: 'Your deepest hopes and fears' },
      { labelKey: 'cards.positionOutcome', description: 'The likely outcome if this path continues' },
    ],
  },
  {
    id: 'free-pull',
    nameKey: 'cards.spreadFreePull',
    cardCount: 0, // 0 = manual, pull one at a time
    maxCards: 15,
    positions: [], // positions assigned dynamically as "Card 1", "Card 2", etc.
  },
];
