import React from 'react';
import clsx from 'clsx';
import s from './rich-text.module.scss';

interface RichTextProps {
  text: string;
  className?: string;
}

/**
 * RichText component that renders HTML content from the rich text editor
 */
export const RichText: React.FC<RichTextProps> = ({ text, className }) => {
  if (!text) return null;

  // Check if text is empty (quill empty paragraph)
  if (text.trim() === '<p><br></p>') return null;

  // Check if the text contains HTML tags (from rich text editor)
  const isHtml = /<[a-z][\s\S]*>/i.test(text);

  if (isHtml) {
    return (
      <div
        className={clsx(s.richTextContent, className)}
        dangerouslySetInnerHTML={{ __html: text }}
      />
    );
  }

  // Fallback for plain text (backward compatibility)
  return (
    <div className={className} style={{ whiteSpace: 'pre-wrap' }}>
      {text}
    </div>
  );
};
