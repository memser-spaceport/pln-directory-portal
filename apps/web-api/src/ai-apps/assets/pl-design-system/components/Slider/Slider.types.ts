import type * as SliderPrimitive from '@radix-ui/react-slider';
import type React from 'react';

export type SliderColor = 'blue' | 'green';
export type SliderSize = 'sm' | 'md' | 'lg';

export interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  color?: SliderColor;
  size?: SliderSize;
  showTooltip?: boolean;
}
