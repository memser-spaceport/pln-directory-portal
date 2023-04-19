import React, { useEffect, useState } from 'react';
import { composeEventHandlers } from '../../utils/event-handlers.utils';

export interface TextAreaProps extends React.ComponentProps<'textarea'> {
  label: string;
  name: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  placeholder?: string;
  required?: boolean;
  showLabel?: boolean;
  info?: string;
}

export function TextArea({
  label,
  name,
  value,
  onChange,
  rows = 1,
  placeholder = 'Enter details here',
  required,
  showLabel = true,
  info,
  ...props
}: TextAreaProps) {
  const [inputValue, setInputValue] = useState(value);
  const requiredIndicator =
    required && !value?.trim() ? 'border custom-red' : '';

  useEffect(() => {
    setInputValue(value);
  }, [setInputValue, value]);

  function handleUserInput(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputValue(event.currentTarget.value);
  }

  return (
    <div className="text-area-container ">
      <label htmlFor={name} className="text-area-label text-sm font-bold">
        {label}
        {required ? <span className="required">*</span> : null}
      </label>
      {info && (
        <div className="py-2">
          <span className="font-size-13 text-sm text-gray-400">{info}</span>
        </div>
      )}
      <textarea
        {...props}
        name={name}
        placeholder={placeholder}
        className={`on-focus hover:shadow-on-hover mt-[10px] block w-full rounded-lg border border-white bg-white px-3 py-2 text-sm leading-5 text-slate-900 shadow-sm shadow-slate-300
        transition duration-150 ease-in-out placeholder:text-sm placeholder:text-slate-400 disabled:bg-gray-200 ${
          props.className || ''
        } ${requiredIndicator}`}
        rows={rows}
        onChange={composeEventHandlers(onChange, handleUserInput)}
        value={inputValue}
      />
    </div>
  );
}
