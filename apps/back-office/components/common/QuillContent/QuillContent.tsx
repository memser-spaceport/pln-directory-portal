'use client';

import clsx from 'clsx';
import 'react-quill-new/dist/quill.snow.css';

import s from './QuillContent.module.scss';

interface Props {
  html: string;
  className?: string;
}

// Pasted content (e.g. from news articles) can carry non-breaking spaces used for
// typographic orphan/widow prevention. A non-breaking space can't be a line-wrap
// point, so if the browser can't wrap there it breaks mid-word in the adjacent
// word instead. Normalize to regular spaces before rendering.
const NBSP_PATTERN = /&nbsp;|&#0*160;|&#x0*a0;|\u00A0/gi;

export function QuillContent(props: Props) {
  const { html, className } = props;
  const normalizedHtml = (html ?? '').replace(NBSP_PATTERN, ' ');

  return (
    <div
      className={clsx('ql-editor', s.content, className)}
      dangerouslySetInnerHTML={{ __html: normalizedHtml }}
    />
  );
}
