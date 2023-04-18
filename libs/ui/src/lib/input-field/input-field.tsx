import { EyeIcon, EyeOffIcon, XIcon } from '@heroicons/react/outline';
import React, { useEffect, useState } from 'react';
import { composeEventHandlers } from '../../utils/event-handlers.utils';

type HeroIcon = (props: React.ComponentProps<'svg'>) => JSX.Element;

export interface InputFieldProps extends React.ComponentProps<'input'> {
  label: string;
  icon?: HeroIcon;
  hasClear?: boolean;
  onClear?: () => void;
  required?: boolean;
  showLabel?: boolean;
  value?: string;
  error?: string;
}

export function InputField({
  label,
  icon,
  defaultValue = '',
  hasClear,
  onClear,
  required,
  showLabel = true,
  value,
  error,
  ...props
}: InputFieldProps) {
  const [inputValue, setInputValue] = useState(value);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const InputIcon = icon;
  const requiredIndicator =
    required && !value?.trim() ? 'border custom-red' : '';

  useEffect(() => {
    setInputValue(value);
  }, [setInputValue, value]);

  function handleUserInput(event: React.ChangeEvent<HTMLInputElement>) {
    if (!props?.pattern || event.currentTarget.value.match(props.pattern)) {
      setInputValue(event.currentTarget.value);
      props.onChange !== undefined && props.onChange(event);
    }
  }

  function handleClear() {
    setInputValue('');
    onClear?.();
  }

  function showPasswordAction() {
    setShowPassword(!showPassword);
  }

  return (
    <label className="relative block">
      {showLabel ? (
        <span className="py-2 text-sm font-bold">
          {error ? error : required ? label + ' *' : label}
        </span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
      {InputIcon ? (
        <InputIcon className="stroke-1.5 absolute inset-y-0 left-2 my-auto h-4 w-4 text-slate-600" />
      ) : null}
      <input
        {...props}
        type={showPassword ? 'text' : props.type}
        className={`block w-full rounded-lg bg-white text-sm leading-6 text-slate-900 shadow-sm shadow-slate-300 transition duration-150 ease-in-out placeholder:text-sm placeholder:text-slate-400
        ${icon ? 'pl-8' : 'pl-3'} ${hasClear ? 'pr-6' : 'pr-3'} on-focus
        hover:shadow-on-hover h-10 leading-10 disabled:bg-gray-200 ${
          props.className
        } ${requiredIndicator}`}
        onChange={handleUserInput}
        value={inputValue || ''}
      />
      {props.type === 'password' && (
        <div
          className="stroke-1.5 absolute absolute inset-y-0 right-4 top-[50%]
       my-auto h-[20px] w-[20px] text-slate-600"
          onClick={showPasswordAction}
        >
          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
        </div>
      )}

      {hasClear ? (
        <button
          className={`absolute inset-y-0 right-0 pr-2 ${
            inputValue ? '' : 'hidden'
          }`}
          onClick={handleClear}
        >
          <XIcon className="h-3 w-3 fill-slate-600" />
        </button>
      ) : null}
    </label>
  );
}
