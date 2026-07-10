import type * as SwitchPrimitive from '@radix-ui/react-switch';
import type { ReactNode } from 'react';
import React from 'react';

export type SwitchSize = 'sm' | 'md' | 'lg';
export type LabelPosition = 'left' | 'right';

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  size?: SwitchSize;
  label?: ReactNode;
  labelPosition?: LabelPosition;
  description?: ReactNode;
}
