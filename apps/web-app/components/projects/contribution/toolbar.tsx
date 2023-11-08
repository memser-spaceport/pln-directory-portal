import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { FORMAT_TEXT_COMMAND } from "lexical";
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, REMOVE_LIST_COMMAND, $isListNode, ListNode } from '@lexical/list';
import styles from "./Toolbar.module.css";

export function Toolbar() {
    const [editor] = useLexicalComposerContext();
    editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    return <>
        <div className="toolbar">
            <button className="buttonBold" onClick={() => {editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}} aria-label="Format bold">B</button>
           <button
                className="buttonItalic"
                onClick={() => {
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
                }}
                aria-label="Format italic"
            >
                i
            </button>
            <button
                className="buttonUnderline"
                onClick={() => {
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
                }}
                aria-label="Format underline"
            >
                u
            </button>
        </div>
        <style jsx>
            {
                `
            .toolbar {
                display: flex;
                padding: 1em;
                gap: 6px;
              }

              .button {
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border-radius: 6px;
                height: 32px;
                width: 32px;
                background: #fff;
                color: #1f2937;
                border: none;
                box-shadow:
                  rgba(0, 0, 0, 0.12) 0 4px 8px 0,
                  rgba(0, 0, 0, 0.02) 0 0 0 1px;
              }

              .button:hover {
                color: #111827;
                box-shadow:
                  rgba(0, 0, 0, 0.16) 0 5px 8px 0,
                  rgba(0, 0, 0, 0.04) 0 0 0 1px;
              }

              .button:focus-visible {
                outline-offset: 2px;
              }

              .button:active {
                box-shadow:
                  rgba(0, 0, 0, 0.16) 0 2px 3px 0,
                  rgba(0, 0, 0, 0.04) 0 0 0 1px;
              }

            `
            }
        </style>

    </>
}