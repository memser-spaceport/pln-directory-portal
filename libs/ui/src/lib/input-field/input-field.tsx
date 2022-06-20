import { XIcon } from '@heroicons/react/solid';
import React, { useState } from 'react';
import { composeEventHandlers } from '../../utils/event-handlers.utils';

type HeroIcon = (props: React.ComponentProps<'svg'>) => JSX.Element;

interface InputFieldProps extends React.ComponentProps<'input'> {
  label: string;
  icon?: HeroIcon;
  hasClear?: boolean;
  onClear?: () => void;
}

export function InputField({
  label,
  icon,
  defaultValue = '',
  hasClear,
  onClear,
  ...props
}: InputFieldProps) {
  const [inputValue, setInputValue] = useState(defaultValue);
  const InputIcon = icon;

  function handleUserInput(event: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(event.currentTarget.value);
  }

  function handleClear() {
    setInputValue('');
    onClear?.();
  }

  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      {InputIcon ? (
        <InputIcon className="absolute inset-y-0 left-2 my-auto h-4 w-4 fill-slate-600" />
      ) : null}
      <input
        {...props}
        className={`block w-full rounded-lg border border-slate-300 bg-white text-sm leading-6 text-slate-600 placeholder:text-sm placeholder:text-slate-600 
        ${icon ? 'pl-8' : 'pl-3'} shadow-slate-900/16 h-10 pr-2
        leading-10 shadow-sm focus:border-sky-300 focus:outline-none focus:ring focus:ring-sky-300/30 ${
          props.className || ''
        }`}
        onChange={composeEventHandlers(props.onChange, handleUserInput)}
        value={inputValue}
      />
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
