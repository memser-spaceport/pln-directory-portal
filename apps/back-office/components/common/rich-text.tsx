import React, { useMemo } from 'react';
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
  // Check if the text contains HTML tags (from rich text editor)
  const isHtml = /<[a-z][\s\S]*>/i.test(text);

  // Fix links that don't have protocols to prevent relative URL issues
  const processedHtml = useMemo(() => {
    if (!isHtml) return text;

    // Add https:// to links that don't have http://, https://, or mailto:
    return text.replace(
      /<a\s+href="(?!https?:\/\/|mailto:|#)([^"]+)"/gi,
      '<a href="https://$1"'
    );
  }, [text, isHtml]);

  if (!text) return null;

  // Check if text is empty (quill empty paragraph)
  if (text.trim() === '<p><br></p>') return null;

  if (isHtml) {
    return (
      <div
        className={clsx(s.richTextContent, className)}
        dangerouslySetInnerHTML={{ __html: processedHtml }}
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
