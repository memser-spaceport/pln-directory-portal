import type { ReactNode } from 'react';

export interface LightboxImage {
  src: string;
  alt?: string;
  caption?: string;
}

export interface LightboxProps {
  images: LightboxImage[];
  initialIndex?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}
