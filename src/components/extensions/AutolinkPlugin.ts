import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Extension } from '@tiptap/core';

// URL regex pattern
const URL_REGEX = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/gi;

export const AutolinkPlugin = Extension.create({
  name: 'autolinkPlugin',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('autolinkPlugin'),
        appendTransaction: (transactions, _oldState, newState) => {
          const docChanged = transactions.some(tr => tr.docChanged);
          if (!docChanged) return null;

          const { tr } = newState;
          const { schema } = newState;
          let modified = false;

          newState.doc.descendants((node, pos) => {
            if (node.isText && node.text) {
              const matches = Array.from(node.text.matchAll(URL_REGEX));
              
              matches.forEach(match => {
                const url = match[0];
                const start = pos + match.index!;
                const end = start + url.length;

                // Check if this text is already a link
                const $start = newState.doc.resolve(start);
                const linkMark = schema.marks.link;
                const hasLink = $start.marks().some(mark => mark.type === linkMark);

                if (!hasLink) {
                  tr.addMark(
                    start,
                    end,
                    schema.marks.link.create({ href: url })
                  );
                  modified = true;
                }
              });
            }
          });

          return modified ? tr : null;
        },
      }),
    ];
  },
});
