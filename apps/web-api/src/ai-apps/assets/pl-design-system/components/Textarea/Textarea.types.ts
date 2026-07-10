import type { TextareaHTMLAttributes } from 'react';

export type TextareaResize = 'none' | 'vertical';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  rows?: number;
  resize?: TextareaResize;
  fullWidth?: boolean;
}
