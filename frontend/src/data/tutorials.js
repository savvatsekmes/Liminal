// Guided-tour content. Each tour is an array of step objects rendered by
// the TutorialOverlay (`frontend/src/components/TutorialContext.jsx`).
//
// Step shape:
//   {
//     targetId: string,          // matches a [data-tour-id] in the DOM
//     titleKey: string,          // i18n key for tooltip heading
//     bodyKey: string,           // i18n key for tooltip prose
//     placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto',
//     padding?: number,
//     before?: { event, detail }
//   }
//
// Copy lives in frontend/src/i18n/<lang>.js under tutorials.* keys.

export const TOURS = {
  home: [
    {
      targetId: 'home-quick-action',
      titleKey: 'tutorials.home.homeQuickAction.title',
      bodyKey: 'tutorials.home.homeQuickAction.body',
    },
    {
      targetId: 'home-quick-mode-entry',
      titleKey: 'tutorials.home.homeQuickModeEntry.title',
      bodyKey: 'tutorials.home.homeQuickModeEntry.body',
    },
    {
      targetId: 'home-quick-mode-note',
      titleKey: 'tutorials.home.homeQuickModeNote.title',
      bodyKey: 'tutorials.home.homeQuickModeNote.body',
    },
    {
      targetId: 'home-quick-mode-ask',
      titleKey: 'tutorials.home.homeQuickModeAsk.title',
      bodyKey: 'tutorials.home.homeQuickModeAsk.body',
    },
    {
      targetId: 'home-search',
      titleKey: 'tutorials.home.homeSearch.title',
      bodyKey: 'tutorials.home.homeSearch.body',
    },
    {
      targetId: 'home-edit-layout',
      titleKey: 'tutorials.home.homeEditLayout.title',
      bodyKey: 'tutorials.home.homeEditLayout.body',
    },
    {
      targetId: 'home-theme-toggle',
      titleKey: 'tutorials.home.homeThemeToggle.title',
      bodyKey: 'tutorials.home.homeThemeToggle.body',
    },
    {
      targetId: 'home-quote-speak',
      titleKey: 'tutorials.home.homeQuoteSpeak.title',
      bodyKey: 'tutorials.home.homeQuoteSpeak.body',
    },
  ],
  journal: [
    {
      targetId: 'journal-new-entry',
      titleKey: 'tutorials.journal.journalNewEntry.title',
      bodyKey: 'tutorials.journal.journalNewEntry.body',
    },
    {
      targetId: 'journal-search',
      titleKey: 'tutorials.journal.journalSearch.title',
      bodyKey: 'tutorials.journal.journalSearch.body',
    },
    {
      targetId: 'journal-toolbar',
      titleKey: 'tutorials.journal.journalToolbar.title',
      bodyKey: 'tutorials.journal.journalToolbar.body',
    },
    {
      targetId: 'journal-toggle-block',
      titleKey: 'tutorials.journal.journalToggleBlock.title',
      bodyKey: 'tutorials.journal.journalToggleBlock.body',
    },
    {
      targetId: 'journal-card-pull',
      titleKey: 'tutorials.journal.journalCardPull.title',
      bodyKey: 'tutorials.journal.journalCardPull.body',
    },
    {
      targetId: 'journal-drawing',
      titleKey: 'tutorials.journal.journalDrawing.title',
      bodyKey: 'tutorials.journal.journalDrawing.body',
    },
    {
      targetId: 'journal-lock',
      titleKey: 'tutorials.journal.journalLock.title',
      bodyKey: 'tutorials.journal.journalLock.body',
    },
    {
      targetId: 'journal-versions',
      titleKey: 'tutorials.journal.journalVersions.title',
      bodyKey: 'tutorials.journal.journalVersions.body',
    },
    {
      targetId: 'journal-tags',
      titleKey: 'tutorials.journal.journalTags.title',
      bodyKey: 'tutorials.journal.journalTags.body',
    },
    {
      targetId: 'journal-tag-filter',
      titleKey: 'tutorials.journal.journalTagFilter.title',
      bodyKey: 'tutorials.journal.journalTagFilter.body',
    },
    {
      targetId: 'journal-polish',
      titleKey: 'tutorials.journal.journalPolish.title',
      bodyKey: 'tutorials.journal.journalPolish.body',
    },
    {
      targetId: 'journal-generate-title',
      titleKey: 'tutorials.journal.journalGenerateTitle.title',
      bodyKey: 'tutorials.journal.journalGenerateTitle.body',
    },
    {
      targetId: 'journal-dictate',
      titleKey: 'tutorials.journal.journalDictate.title',
      bodyKey: 'tutorials.journal.journalDictate.body',
    },
    {
      targetId: 'journal-read-aloud',
      titleKey: 'tutorials.journal.journalReadAloud.title',
      bodyKey: 'tutorials.journal.journalReadAloud.body',
    },
    {
      targetId: 'journal-send-to-chat',
      titleKey: 'tutorials.journal.journalSendToChat.title',
      bodyKey: 'tutorials.journal.journalSendToChat.body',
    },
    {
      targetId: 'journal-reflect',
      titleKey: 'tutorials.journal.journalReflect.title',
      bodyKey: 'tutorials.journal.journalReflect.body',
    },
    {
      targetId: 'journal-edit-reflections',
      titleKey: 'tutorials.journal.journalEditReflections.title',
      bodyKey: 'tutorials.journal.journalEditReflections.body',
    },
    {
      targetId: 'journal-mirror-archetype',
      titleKey: 'tutorials.journal.journalMirrorArchetype.title',
      bodyKey: 'tutorials.journal.journalMirrorArchetype.body',
    },
    {
      targetId: 'journal-mirror-read-aloud',
      titleKey: 'tutorials.journal.journalMirrorReadAloud.title',
      bodyKey: 'tutorials.journal.journalMirrorReadAloud.body',
    },
  ],
  notes: [
    {
      targetId: 'notes-new-note',
      titleKey: 'tutorials.notes.notesNewNote.title',
      bodyKey: 'tutorials.notes.notesNewNote.body',
    },
    {
      targetId: 'notes-search',
      titleKey: 'tutorials.notes.notesSearch.title',
      bodyKey: 'tutorials.notes.notesSearch.body',
    },
    {
      targetId: 'notes-type-rail',
      titleKey: 'tutorials.notes.notesTypeRail.title',
      bodyKey: 'tutorials.notes.notesTypeRail.body',
    },
    {
      targetId: 'notes-custom-tag',
      titleKey: 'tutorials.notes.notesCustomTag.title',
      bodyKey: 'tutorials.notes.notesCustomTag.body',
    },
    {
      targetId: 'notes-toolbar',
      titleKey: 'tutorials.notes.notesToolbar.title',
      bodyKey: 'tutorials.notes.notesToolbar.body',
    },
    {
      targetId: 'notes-lock',
      titleKey: 'tutorials.notes.notesLock.title',
      bodyKey: 'tutorials.notes.notesLock.body',
    },
    {
      targetId: 'notes-versions',
      titleKey: 'tutorials.notes.notesVersions.title',
      bodyKey: 'tutorials.notes.notesVersions.body',
    },
    {
      targetId: 'notes-polish',
      titleKey: 'tutorials.notes.notesPolish.title',
      bodyKey: 'tutorials.notes.notesPolish.body',
    },
    {
      targetId: 'notes-generate-title',
      titleKey: 'tutorials.notes.notesGenerateTitle.title',
      bodyKey: 'tutorials.notes.notesGenerateTitle.body',
    },
    {
      targetId: 'notes-dictate',
      titleKey: 'tutorials.notes.notesDictate.title',
      bodyKey: 'tutorials.notes.notesDictate.body',
    },
    {
      targetId: 'notes-read-aloud',
      titleKey: 'tutorials.notes.notesReadAloud.title',
      bodyKey: 'tutorials.notes.notesReadAloud.body',
    },
    {
      targetId: 'notes-send-to-chat',
      titleKey: 'tutorials.notes.notesSendToChat.title',
      bodyKey: 'tutorials.notes.notesSendToChat.body',
    },
    {
      targetId: 'notes-reflect',
      titleKey: 'tutorials.notes.notesReflect.title',
      bodyKey: 'tutorials.notes.notesReflect.body',
    },
    {
      targetId: 'notes-edit-reflections',
      titleKey: 'tutorials.notes.notesEditReflections.title',
      bodyKey: 'tutorials.notes.notesEditReflections.body',
    },
    {
      targetId: 'notes-mirror-archetype',
      titleKey: 'tutorials.notes.notesMirrorArchetype.title',
      bodyKey: 'tutorials.notes.notesMirrorArchetype.body',
    },
    {
      targetId: 'notes-mirror-read-aloud',
      titleKey: 'tutorials.notes.notesMirrorReadAloud.title',
      bodyKey: 'tutorials.notes.notesMirrorReadAloud.body',
    },
  ],
  conversations: [
    {
      targetId: 'conversations-new',
      titleKey: 'tutorials.conversations.conversationsNew.title',
      bodyKey: 'tutorials.conversations.conversationsNew.body',
    },
    {
      targetId: 'conversations-search',
      titleKey: 'tutorials.conversations.conversationsSearch.title',
      bodyKey: 'tutorials.conversations.conversationsSearch.body',
    },
    {
      targetId: 'conversations-tags',
      titleKey: 'tutorials.conversations.conversationsTags.title',
      bodyKey: 'tutorials.conversations.conversationsTags.body',
    },
    {
      targetId: 'conversations-archetype',
      titleKey: 'tutorials.conversations.conversationsArchetype.title',
      bodyKey: 'tutorials.conversations.conversationsArchetype.body',
    },
    {
      targetId: 'conversations-dictate',
      titleKey: 'tutorials.conversations.conversationsDictate.title',
      bodyKey: 'tutorials.conversations.conversationsDictate.body',
    },
    {
      targetId: 'conversations-ask',
      titleKey: 'tutorials.conversations.conversationsAsk.title',
      bodyKey: 'tutorials.conversations.conversationsAsk.body',
    },
  ],
  threads: [
    {
      targetId: 'threads-intro',
      titleKey: 'tutorials.threads.threadsIntro.title',
      bodyKey: 'tutorials.threads.threadsIntro.body',
    },
    {
      targetId: 'threads-rethread',
      titleKey: 'tutorials.threads.threadsRethread.title',
      bodyKey: 'tutorials.threads.threadsRethread.body',
    },
    {
      targetId: 'threads-novel',
      titleKey: 'tutorials.threads.threadsNovel.title',
      bodyKey: 'tutorials.threads.threadsNovel.body',
    },
    {
      targetId: 'threads-add-novel',
      titleKey: 'tutorials.threads.threadsAddNovel.title',
      bodyKey: 'tutorials.threads.threadsAddNovel.body',
    },
  ],
  oracle: [
    {
      targetId: 'oracle-intro',
      titleKey: 'tutorials.oracle.oracleIntro.title',
      bodyKey: 'tutorials.oracle.oracleIntro.body',
    },
    {
      targetId: 'oracle-tabs',
      titleKey: 'tutorials.oracle.oracleTabs.title',
      bodyKey: 'tutorials.oracle.oracleTabs.body',
    },
    {
      targetId: 'oracle-personality',
      titleKey: 'tutorials.oracle.oraclePersonality.title',
      bodyKey: 'tutorials.oracle.oraclePersonality.body',
    },
    {
      targetId: 'oracle-astrology',
      titleKey: 'tutorials.oracle.oracleAstrology.title',
      bodyKey: 'tutorials.oracle.oracleAstrology.body',
    },
    {
      targetId: 'oracle-character',
      titleKey: 'tutorials.oracle.oracleCharacter.title',
      bodyKey: 'tutorials.oracle.oracleCharacter.body',
    },
    {
      targetId: 'oracle-tab-cards',
      titleKey: 'tutorials.oracle.oracleTabCards.title',
      bodyKey: 'tutorials.oracle.oracleTabCards.body',
    },
    {
      targetId: 'oracle-tab-sky',
      titleKey: 'tutorials.oracle.oracleTabSky.title',
      bodyKey: 'tutorials.oracle.oracleTabSky.body',
    },
  ],
  context: [
    {
      targetId: 'context-tabs',
      titleKey: 'tutorials.context.contextTabs.title',
      bodyKey: 'tutorials.context.contextTabs.body',
    },
    {
      targetId: 'context-sliders',
      titleKey: 'tutorials.context.contextSliders.title',
      bodyKey: 'tutorials.context.contextSliders.body',
      before: { event: 'liminal:set-context-tab', detail: "style" },
    },
    {
      targetId: 'context-archetypes',
      titleKey: 'tutorials.context.contextArchetypes.title',
      bodyKey: 'tutorials.context.contextArchetypes.body',
      before: { event: 'liminal:set-context-tab', detail: "archetypes" },
    },
    {
      targetId: 'archetype-voice',
      titleKey: 'tutorials.context.archetypeVoice.title',
      bodyKey: 'tutorials.context.archetypeVoice.body',
      before: { event: 'liminal:set-context-tab', detail: "archetypes" },
    },
    {
      targetId: 'context-create-archetype',
      titleKey: 'tutorials.context.contextCreateArchetype.title',
      bodyKey: 'tutorials.context.contextCreateArchetype.body',
      before: { event: 'liminal:set-context-tab', detail: "archetypes" },
    },
    {
      targetId: 'context-memory',
      titleKey: 'tutorials.context.contextMemory.title',
      bodyKey: 'tutorials.context.contextMemory.body',
      before: { event: 'liminal:set-context-tab', detail: "memory" },
    },
    {
      targetId: 'memory-add-input',
      titleKey: 'tutorials.context.memoryAddInput.title',
      bodyKey: 'tutorials.context.memoryAddInput.body',
      before: { event: 'liminal:set-context-tab', detail: "memory" },
    },
    {
      targetId: 'memory-search',
      titleKey: 'tutorials.context.memorySearch.title',
      bodyKey: 'tutorials.context.memorySearch.body',
      before: { event: 'liminal:set-context-tab', detail: "memory" },
    },
    {
      targetId: 'memory-row',
      titleKey: 'tutorials.context.memoryRow.title',
      bodyKey: 'tutorials.context.memoryRow.body',
      before: { event: 'liminal:tutorial-memory-mock', detail: true },
    },
    {
      targetId: 'memory-core',
      titleKey: 'tutorials.context.memoryCore.title',
      bodyKey: 'tutorials.context.memoryCore.body',
      before: { event: 'liminal:tutorial-memory-mock', detail: true },
    },
    {
      targetId: 'memory-reindex',
      titleKey: 'tutorials.context.memoryReindex.title',
      bodyKey: 'tutorials.context.memoryReindex.body',
      before: { event: 'liminal:tutorial-memory-mock', detail: false },
    },
    {
      targetId: 'memory-extract',
      titleKey: 'tutorials.context.memoryExtract.title',
      bodyKey: 'tutorials.context.memoryExtract.body',
    },
    {
      targetId: 'memory-delete-all',
      titleKey: 'tutorials.context.memoryDeleteAll.title',
      bodyKey: 'tutorials.context.memoryDeleteAll.body',
    },
  ],
};

// Display labels for the Settings → Replay tutorials UI (i18n keys).
export const TOUR_LABELS = {
  home: 'tutorials.label.home',
  journal: 'tutorials.label.journal',
  notes: 'tutorials.label.notes',
  conversations: 'tutorials.label.conversations',
  threads: 'tutorials.label.threads',
  oracle: 'tutorials.label.oracle',
  context: 'tutorials.label.context',
};

export const TOUR_ORDER = ["home","journal","notes","conversations","threads","oracle","context"];
