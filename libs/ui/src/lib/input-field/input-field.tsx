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
        <InputIcon className="absolute left-2 inset-y-0 my-auto w-4 h-4 fill-slate-600" />
      ) : null}
      <input
        {...props}
        className={`text-sm text-slate-600 leading-6 placeholder:text-sm placeholder:text-slate-600 block bg-white border border-slate-300 w-full rounded-lg 
        ${icon ? 'pl-8' : 'pl-3'} pr-2 h-10 leading-10
        shadow-sm shadow-slate-900/16 focus:outline-none focus:ring focus:ring-sky-300/30 focus:border-sky-300 ${
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
          <XIcon className="w-3 h-3 fill-slate-600" />
        </button>
      ) : null}
    </label>
  );
}
