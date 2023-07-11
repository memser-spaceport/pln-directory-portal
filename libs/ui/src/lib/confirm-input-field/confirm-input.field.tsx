import React, { ChangeEvent, useEffect, useRef, useState } from 'react';

export interface ConfirmInputFieldProps extends React.ComponentProps<'input'> {
  label: string;
  value?: string;
  error?: string;
  currentEmail?: string
}

export function ConfirmInputField({
  label,
  error,
  currentEmail,
  ...props
}: ConfirmInputFieldProps) {
  const inputOneRef = useRef() as any;
  const inputTwoRef = useRef() as any;
  const [isMatching, setMatchingState] = useState(true)
  const [isDuplicate, setIsDuplicate] = useState(false)

  const onInputChanges = () => {
    // Check if old and new values match. if yes.. show error
    const isDuplicateValues = ((currentEmail?.toLowerCase().trim() === inputOneRef.current.value.toLowerCase().trim()) || (currentEmail?.trim() === inputTwoRef.current.value.trim()))
    setIsDuplicate(isDuplicateValues);

    if(inputOneRef.current.value.toLowerCase().trim() === '' || inputTwoRef.current.value.toLowerCase().trim() === '') {
      if (props?.onChange) {
        props?.onChange({
          target: {
            name: 'email',
            value: ''
          }
        } as any);
      }
      return;
    }
    const isMatchingValues = inputOneRef.current.value === inputTwoRef.current.value

    setMatchingState(isMatchingValues);

    if(props?.onChange) {
         props.onChange({
            target: {
                name: 'email',
                value: isMatchingValues && !isDuplicateValues ? inputOneRef.current.value : ''
            }
        } as any);
    }
  }

  const handlePaste = (event: any) => {
    event.preventDefault();
  };

  return (
    <label className="relative block w-full">
        <span className="text-sm font-bold">
          {label}
        </span>
      <input
        {...props}
        type="text"
        ref={inputOneRef}
        placeholder='Enter your new email'
        className={`mt-[12px] block w-full rounded-lg bg-white text-sm leading-6 text-slate-900  shadow-slate-300 transition duration-150 ease-in-out placeholder:text-sm placeholder:text-slate-600 placeholder:opacity-50 pl-3 pr-3 on-focus h-10 leading-10 disabled:bg-slate-100  ${props.className}`}
        onChange={onInputChanges}

      />

       <input
        {...props}
        type="text"
        ref={inputTwoRef}
        onPaste={handlePaste}
        placeholder='Confirm your new email'
        className={`mt-[12px] block w-full rounded-lg bg-white text-sm leading-6 text-slate-900  shadow-slate-300 transition duration-150 ease-in-out placeholder:text-sm placeholder:text-slate-600 placeholder:opacity-50 pl-3 pr-3 on-focus h-10 leading-10 disabled:bg-slate-100  ${props.className}`}
        onChange={onInputChanges}

      />
       {(!isMatching && !isDuplicate) && <span className="text-[red] text-xs">Emails do not match</span>}
       {(isDuplicate) && <span className="text-[red] text-xs">New email and old email cannot be same</span>}
    </label>
  );
}
