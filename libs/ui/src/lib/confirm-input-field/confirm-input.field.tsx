import React, { ChangeEvent, useEffect, useState } from 'react';

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
  let inputEvent:  React.ChangeEvent<HTMLInputElement>;
  const [inputOne, setInputOne] = useState('') as any;
  const [inputTwo, setInputTwo] = useState('');
  const [isMatching, setMatchingState] = useState(false)
  const [isDuplicate, setIsDuplicate] = useState(false)


  function handleInputOne(event: React.ChangeEvent<HTMLInputElement>) {
    setInputOne(event.currentTarget.value);
  }

  function handleInputTwo(event: React.ChangeEvent<HTMLInputElement>) {
    setInputTwo(event.currentTarget.value);
  }

  useEffect(() => {
    const isMatchingValues = inputOne === inputTwo
    const isDuplicateValues = ((currentEmail === inputOne) || (currentEmail === inputTwo))
    setMatchingState(isMatchingValues);
    setIsDuplicate(isDuplicateValues)
    if(props?.onChange) {
         props.onChange({
            target: {
                name: 'email',
                value: isMatching ? inputOne : ''
            }
        } as any);
    }
  }, [inputOne, inputTwo])



  return (
    <label className="relative block w-full">
        <span className="text-sm font-bold">
          {label}
        </span>
      <input
        {...props}
        type="text"
        className={`mt-[12px] block w-full rounded-lg bg-white text-sm leading-6 text-slate-900  shadow-slate-300 transition duration-150 ease-in-out placeholder:text-sm placeholder:text-slate-600 placeholder:opacity-50 pl-3 pr-3 on-focus h-10 leading-10 disabled:bg-slate-100  ${props.className}`}
        onChange={handleInputOne}
        value={inputOne || ''}
      />

       <input
        {...props}
        type="text"
        className={`mt-[12px] block w-full rounded-lg bg-white text-sm leading-6 text-slate-900  shadow-slate-300 transition duration-150 ease-in-out placeholder:text-sm placeholder:text-slate-600 placeholder:opacity-50 pl-3 pr-3 on-focus h-10 leading-10 disabled:bg-slate-100  ${props.className}`}
        onChange={handleInputTwo}
        value={inputTwo || ''}
      />
       {(!isMatching && !isDuplicate) && <span style={{ color: 'red' }}>Emails do not match</span>}
       {(isDuplicate) && <span style={{ color: 'red' }}>New email and old email cannot be same</span>}
    </label>
  );
}
