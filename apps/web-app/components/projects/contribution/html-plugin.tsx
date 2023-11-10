import { $generateNodesFromDOM, $generateHtmlFromNodes } from '@lexical/html';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createParagraphNode, $getRoot, $setSelection, CLEAR_HISTORY_COMMAND } from 'lexical';
import { useEffect } from 'react';

const HtmlGeneratorPlugin = (props) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.update(() => {
      const currentHtmlContent = $generateHtmlFromNodes(editor, null);

      if (props?.html && currentHtmlContent !== props?.html && !editor.isComposing()) {
        const parser = new DOMParser();
        const dom = parser.parseFromString(props?.html, 'text/html');
        const nodes = $generateNodesFromDOM(editor, dom);

        // 👇 wrap all text nodes with paragraph node
        const validNodesToInsert = nodes.map((node) => {
          const paragraphNode = $createParagraphNode();

          if (node.getType() === 'text') {
            paragraphNode.append(node);
            return paragraphNode;
          } else {
            return node;
          }
        });

        const root = $getRoot();
        root.clear();
        root.append(...validNodesToInsert);
        $setSelection(null);

        editor.dispatchCommand(CLEAR_HISTORY_COMMAND, void 0);
      }
    });
  }, [editor, props?.html]);
  return null;
};

export default HtmlGeneratorPlugin;