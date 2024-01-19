import { EyeIcon, EyeOffIcon, XIcon } from '@heroicons/react/outline';
import { UserIcon, UserGroupIcon } from '@heroicons/react/solid';
import React, { useEffect, useState } from 'react';

type HeroIcon = (props: React.ComponentProps<'svg'>) => JSX.Element;

export interface InputFieldProps extends React.ComponentProps<'input'> {
  label: string;
  icon?: HeroIcon | string;
  hasClear?: boolean;
  onClear?: () => void;
  required?: boolean;
  showLabel?: boolean;
  value?: string;
  error?: string;
  dropDownType?: string;
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
  dropDownType,
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
    <label className="relative block w-full">
      {showLabel ? (
        <span className="text-sm font-bold">
          {error ? error : required ? label + '*' : label}
        </span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
      {dropDownType === 'member' && !InputIcon ? (
        <UserIcon className="absolute top-5 left-[5px] h-6 w-6 rounded-full bg-gray-200 fill-white" />
      ) : null}
      {dropDownType === 'team' && !InputIcon ? (
        <UserGroupIcon className="absolute top-5 left-[5px] h-6 w-6 rounded-full bg-gray-200 fill-white" />
      ) : null}
      {InputIcon && typeof InputIcon !== 'string' ? (
        <InputIcon className="stroke-1.5 absolute inset-y-0 left-2 my-auto h-4 w-4 text-slate-600" />
      ) : null}
      {InputIcon && typeof InputIcon === 'string' ? (
        <img
          src={InputIcon.toString()}
          className="absolute top-5 left-[5px] h-6 w-6 rounded-full"
        ></img>
      ) : null}
      <input
        {...props}
        type={showPassword ? 'text' : props.type}
        className={`mt-[12px] block w-full rounded-lg bg-white text-sm leading-6 text-slate-900  shadow-slate-300 transition duration-150 ease-in-out placeholder:text-sm placeholder:text-slate-600 placeholder:opacity-50
        ${hasClear && props.type !== 'date' ? 'pr-6' : 'pr-2'}
        ${
          icon || dropDownType === 'member' || dropDownType === 'team'
            ? 'truncate pl-9 !pr-6'
            : 'pl-3'
        } h-10 leading-10 disabled:bg-slate-100 ${
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
          {showPassword ? <EyeIcon /> : <EyeOffIcon />}
        </div>
      )}

      {hasClear && !props.disabled ? (
        <button
          className={`absolute inset-y-0 ${
            props.type === 'date' ? 'top-9 right-8' : 'right-0 pr-2'
          } ${inputValue ? '' : 'hidden'}`}
          onClick={handleClear}
        >
          <XIcon className="h-3 w-3 fill-slate-600" />
        </button>
      ) : null}
    </label>
  );
}
