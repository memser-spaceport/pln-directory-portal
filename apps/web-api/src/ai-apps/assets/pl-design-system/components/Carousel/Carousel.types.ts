import type { ReactNode, HTMLAttributes } from 'react';

export interface CarouselProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  slidesToShow?: number;
  gap?: number;
  showArrows?: boolean;
  showDots?: boolean;
  loop?: boolean;
  autoPlay?: number;
}
