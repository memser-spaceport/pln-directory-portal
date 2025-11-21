import React from 'react';
import Linkify from 'linkify-react';

interface RichTextProps {
  text: string;
  className?: string;
}

/**
 * RichText component that renders text with clickable links
 * Automatically detects URLs in text and converts them to clickable links using linkify-react
 * Preserves line breaks and whitespace
 */
export const RichText: React.FC<RichTextProps> = ({ text, className }) => {
  if (!text) return null;

  return (
    <div className={className} style={{ whiteSpace: 'pre-wrap' }}>
      <Linkify
        options={{
          target: '_blank',
          rel: 'noopener noreferrer',
          className: 'text-blue-600 underline cursor-pointer hover:text-blue-800',
        }}
      >
        {text}
      </Linkify>
    </div>
  );
};