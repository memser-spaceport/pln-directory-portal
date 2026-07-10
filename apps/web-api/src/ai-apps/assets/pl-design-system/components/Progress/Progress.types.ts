export type ProgressColor = 'blue' | 'green' | 'yellow' | 'red';
export type ProgressSize = 'sm' | 'md' | 'lg';

export interface ProgressProps {
  value?: number;
  max?: number;
  color?: ProgressColor;
  size?: ProgressSize;
  label?: string;
  showValue?: boolean;
  animated?: boolean;
  className?: string;
}
