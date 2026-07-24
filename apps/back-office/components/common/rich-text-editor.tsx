'use client';

import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import ReactQuill, { Quill } from 'react-quill-new';
import clsx from 'clsx';

import 'react-quill-new/dist/quill.snow.css';

import s from './rich-text-editor.module.scss';

interface Props {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  errorMessage?: string;
  id?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  placeholder?: string;
}

const RichTextEditor = forwardRef<ReactQuill, Props>((props, ref) => {
  const { value, maxLength, onChange, className, errorMessage, id, disabled, autoFocus, placeholder } = props;

  const quillRef = useRef<any>(null);
  const [charCount, setCharCount] = useState(0);

  // Update character count when value changes
  useEffect(() => {
    const editor = quillRef.current?.getEditor();
    if (editor) {
      // Quill adds a trailing newline, so subtract 1
      setCharCount(Math.max(0, editor.getLength() - 1));
    }
  }, [value]);

  // Custom link handler to ensure URLs have protocols
  const handleLink = React.useCallback((value: any) => {
    if (value) {
      const editor = quillRef.current?.getEditor();
      if (!editor) return;

      const range = editor.getSelection();
      if (!range) return;

      const url = prompt('Enter the URL:');
      if (!url) return;

      // Add https:// if the URL doesn't have a protocol
      let formattedUrl = url;
      if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
        formattedUrl = `https://${url}`;
      }

      editor.formatText(range.index, range.length, 'link', formattedUrl);
    } else {
      const editor = quillRef.current?.getEditor();
      if (!editor) return;
      const range = editor.getSelection();
      if (range) {
        editor.formatText(range.index, range.length, 'link', false);
      }
    }
  }, []);

  // Define toolbar modules (without image upload)
  const modules = useMemo(() => {
    return {
      toolbar: {
        container: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'strike', 'underline'],
          [{ color: [] }, { background: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ align: [] }],
          ['code-block', 'link'],
        ],
        handlers: {
          link: handleLink,
        },
      },
      clipboard: {
        matchers: [
          [
            Node.TEXT_NODE,
            (node: Text, delta: any) => {
              const urlRegex = /https?:\/\/[^\s<]+/g;
              const text = node.data;
              if (urlRegex.test(text)) {
                const Delta = Quill.import('delta');
                const newDelta = new Delta();
                let lastIndex = 0;
                urlRegex.lastIndex = 0;
                let match;
                while ((match = urlRegex.exec(text)) !== null) {
                  if (match.index > lastIndex) {
                    newDelta.insert(text.slice(lastIndex, match.index));
                  }
                  newDelta.insert(match[0], { link: match[0] });
                  lastIndex = match.index + match[0].length;
                }
                if (lastIndex < text.length) {
                  newDelta.insert(text.slice(lastIndex));
                }
                return newDelta;
              }
              return delta;
            },
          ],
        ],
      },
    };
  }, [handleLink]);

  useEffect(() => {
    if (quillRef.current && autoFocus) {
      quillRef.current.focus();
    }
  }, [autoFocus]);

  const handleChange = (content: string) => {
    const { editor } = quillRef.current || {};

    if (maxLength && editor) {
      // +1 as Quill adds \n in the end
      if (editor.getLength() > maxLength + 1) {
        editor.deleteText(maxLength, editor.getLength());
      } else {
        onChange(content);
      }
    } else {
      onChange(content);
    }
  };

  return (
    <div
      className={clsx(s.root, {
        [s.error]: !!errorMessage,
      })}
      id={id}
    >
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={handleChange}
        className={clsx(s.editor, className)}
        readOnly={disabled}
        modules={modules}
        placeholder={placeholder}
      />
      <div className={s.footer}>
        {maxLength && (
          <div className={clsx(s.charCounter, { [s.limit]: charCount >= maxLength })}>
            {charCount}/{maxLength} characters left
          </div>
        )}
        {errorMessage && <div className={s.errorMessage}>{errorMessage}</div>}
      </div>
    </div>
  );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
