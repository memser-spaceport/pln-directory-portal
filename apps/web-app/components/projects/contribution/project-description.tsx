
import React, {useMemo} from 'react';
import {InitialConfigType, LexicalComposer} from '@lexical/react/LexicalComposer';
import {RichTextPlugin} from "@lexical/react/LexicalRichTextPlugin";
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { OnChangePlugin } from './onchange-plugin';

function ProjectDescription() {
    const CustomContent = useMemo(() => {
        return (
            <ContentEditable style={{
                position: 'relative',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                height: '200px',
                width: '100%',
                fontSize: '13px',
                padding: '10px'
            }}/>
        )
    }, []);

    const CustomPlaceholder = useMemo(() => {
        return (
            <div style={{
                position: 'absolute', top: 30, left: 30,
            }}>
                Enter Project Contribution...
            </div>
        )
    }, []);

    const lexicalConfig: InitialConfigType = {
        namespace: 'My Rich Text Editor',
        onError: (e) => {
            console.log('ERROR:', e)
        }
    }


    return (
        <div>
            <LexicalComposer initialConfig={lexicalConfig}>
                <RichTextPlugin
                    contentEditable={CustomContent}
                    placeholder={CustomPlaceholder}
                    ErrorBoundary={LexicalErrorBoundary}
                />
                <OnChangePlugin/>
            </LexicalComposer>
        </div>
    );
}

export default ProjectDescription;