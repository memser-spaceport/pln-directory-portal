'use client';

import clsx from 'clsx';
import 'react-quill/dist/quill.snow.css';

import s from './QuillContent.module.scss';

interface Props {
  html: string;
  className?: string;
}

export function QuillContent(props: Props) {
  const { html, className } = props;

  return (
    <div
      className={clsx('ql-editor', s.content, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
