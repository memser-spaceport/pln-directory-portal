import type { InputHTMLAttributes } from 'react';

export type SearchInputVariant = 'default' | 'button' | 'underline';

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: SearchInputVariant;
  onClear?: () => void;
  loading?: boolean;
  fullWidth?: boolean;
}
