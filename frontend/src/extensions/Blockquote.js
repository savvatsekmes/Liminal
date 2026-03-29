import { Node } from '@tiptap/core';

const Blockquote = Node.create({
  name: 'blockquote',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'blockquote' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['blockquote', HTMLAttributes, 0];
  },

  addCommands() {
    return {
      toggleBlockquote: () => ({ commands }) => {
        return commands.toggleWrap(this.name);
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-b': () => this.editor.commands.toggleBlockquote(),
    };
  },
});

export default Blockquote;
