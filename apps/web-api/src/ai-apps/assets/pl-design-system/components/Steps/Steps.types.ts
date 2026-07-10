import type { HTMLAttributes } from 'react';

export type StepStatus = 'completed' | 'current' | 'upcoming';

export interface Step {
  id: string | number;
  title?: string;
  description?: string;
  status?: StepStatus;
}

export type StepsOrientation = 'horizontal' | 'vertical';

export interface StepsProps extends HTMLAttributes<HTMLDivElement> {
  steps: Step[];
  currentStep?: number;
  orientation?: StepsOrientation;
}
