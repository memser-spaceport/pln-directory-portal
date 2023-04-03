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
}

export function TextArea({
  label,
  name,
  value,
  onChange,
  rows = 4,
  placeholder = '',
  required,
  showLabel = true,
  ...props
}: TextAreaProps) {
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [setInputValue, value]);

  function handleUserInput(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputValue(event.currentTarget.value);
  }

  return (
    <div className="text-area-container ">
      <label htmlFor={name} className="text-area-label">{label}{required ? <span className="required">*</span> : null}</label>
      <textarea
        {...props}
        name={name}
        className={`on-focus hover:shadow-on-hover block h-10 w-full rounded-lg border border-white bg-white text-sm leading-6 leading-10 text-slate-900 shadow-sm shadow-slate-300 transition duration-150
        ease-in-out placeholder:text-sm placeholder:text-slate-600 ${
          props.className || ''
        }`}
        rows={rows}
        onChange={composeEventHandlers(onChange, handleUserInput)}
        value={inputValue}
      />
    </div>
  );
}
