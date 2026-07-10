import type { ReactNode } from 'react';
import type * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import React from 'react';

export type CheckboxSize = 'sm' | 'md' | 'lg';

export interface CheckboxProps extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  size?: CheckboxSize;
  label?: ReactNode;
  description?: ReactNode;
  id?: string;
}
