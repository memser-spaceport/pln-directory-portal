import type { HTMLAttributes, ReactNode } from 'react';

export interface UploadFile {
  id: string;
  name: string;
  size: number;
  progress?: number;
  error?: string;
  url?: string;
  type?: string;
}

export interface UploadProps extends HTMLAttributes<HTMLDivElement> {
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  files?: UploadFile[];
  onFilesChange?: (files: File[]) => void;
  onRemove?: (id: string) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  icon?: ReactNode;
}
