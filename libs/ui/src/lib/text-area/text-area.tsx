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
        {required ? label + '*' : label}
      </label>
      {info && (
        <div className="text-[13px] font-medium leading-[18px] text-[#0F172A] opacity-40">
          {info}
        </div>
      )}
      <textarea
        {...props}
        name={name}
        placeholder={placeholder}
        className={`hover:shadow-on-hover mt-[12px] block w-full rounded-lg border border-white bg-white px-3 py-2 text-sm leading-5 text-slate-900 shadow-sm shadow-slate-300
        transition duration-150 ease-in-out placeholder:text-sm placeholder:text-slate-600 placeholder:opacity-50 disabled:bg-slate-100 ${
          props.className || ''
        } ${requiredIndicator}`}
        rows={rows}
        onChange={composeEventHandlers(onChange, handleUserInput)}
        value={inputValue}
      />
    </div>
  );
}
