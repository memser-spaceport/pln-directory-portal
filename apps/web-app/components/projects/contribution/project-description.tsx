
import React, {useMemo} from 'react';
import {InitialConfigType, LexicalComposer} from '@lexical/react/LexicalComposer';
import {RichTextPlugin} from "@lexical/react/LexicalRichTextPlugin";
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {ListPlugin} from '@lexical/react/LexicalListPlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import HtmlGeneratorPlugin from './html-plugin';
import { $generateHtmlFromNodes } from '@lexical/html';
import { CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { ListNode, ListItemNode } from '@lexical/list';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import { Toolbar } from './toolbar';

function ProjectDescription(props) {
    const onItemChange = props.onItemChange;
    const content = props.content;
    const onChange = (editorState, editor) => {
        editor.update(() => {
          const rawHTML = $generateHtmlFromNodes(editor, null);
          onItemChange(rawHTML);
        });
      };
    const CustomContent = useMemo(() => {
        return (
            <ContentEditable style={{
                position: 'relative',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                height: '200px',
                width: '100%',
                fontSize: '13px',
                padding: '10px',
                overflowY: 'scroll'
            }}/>
        )
    }, []);

    const CustomPlaceholder = useMemo(() => {
        return (
            <div className="absolute top-[10px] left-[16px] text-slate-400 text-[14px]">
                Enter Project Contribution...
            </div>
        )
    }, []);

    const lexicalConfig: InitialConfigType = {
        namespace: 'My Rich Text Editor',
        nodes: [
            ListNode,
            ListItemNode,
            CodeNode,
            LinkNode,
            HeadingNode,
            QuoteNode,
            HorizontalRuleNode
        ],
        onError: (e) => {
            console.log('ERROR:', e)
        },

    }


    return (
        <div className='relative mt-[12px]'>
            <LexicalComposer initialConfig={lexicalConfig}>
                <RichTextPlugin
                    contentEditable={CustomContent}
                    placeholder={CustomPlaceholder}
                    ErrorBoundary={LexicalErrorBoundary}
                />
                <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
                <OnChangePlugin onChange={onChange}/>
                <HtmlGeneratorPlugin html={content}/>
                <ListPlugin/>
            </LexicalComposer>
        </div>
    );
}

export default ProjectDescription;