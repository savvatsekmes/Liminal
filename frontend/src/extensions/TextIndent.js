import { Extension } from '@tiptap/core';

// Adds paragraph + heading indent that survives copy / paste / save by storing
// the level as an `indent` attribute (0-8). The toolbar Indent/Outdent buttons
// fall through to this when the cursor isn't inside a list item — sinkListItem
// / liftListItem only act on list items, so they were silent no-ops everywhere
// else. The indent value renders as `margin-left: <level * 24>px` and serialises
// as `data-indent="N"` for round-trip integrity.

const MIN = 0;
const MAX = 8;
const STEP_PX = 24;

export const TextIndent = Extension.create({
  name: 'textIndent',

  addOptions() {
    return { types: ['paragraph', 'heading'] };
  },

  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        indent: {
          default: 0,
          parseHTML: (el) => parseInt(el.getAttribute('data-indent') || '0', 10) || 0,
          renderHTML: (attrs) => {
            const v = attrs.indent || 0;
            if (v <= 0) return {};
            return {
              'data-indent': v,
              style: `margin-left: ${v * STEP_PX}px`,
            };
          },
        },
      },
    }];
  },

  addCommands() {
    return {
      // Indent: sink list item if inside a list, else bump paragraph/heading indent.
      indent: () => ({ editor, commands }) => {
        if (editor.isActive('listItem')) {
          return commands.sinkListItem('listItem');
        }
        const { $from } = editor.state.selection;
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (this.options.types.includes(node.type.name)) {
            const cur = node.attrs.indent || 0;
            const next = Math.min(MAX, cur + 1);
            if (next === cur) return false;
            return commands.updateAttributes(node.type.name, { indent: next });
          }
        }
        return false;
      },
      outdent: () => ({ editor, commands }) => {
        if (editor.isActive('listItem')) {
          return commands.liftListItem('listItem');
        }
        const { $from } = editor.state.selection;
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (this.options.types.includes(node.type.name)) {
            const cur = node.attrs.indent || 0;
            const next = Math.max(MIN, cur - 1);
            if (next === cur) return false;
            return commands.updateAttributes(node.type.name, { indent: next });
          }
        }
        return false;
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.indent(),
      'Shift-Tab': () => this.editor.commands.outdent(),
    };
  },
});
