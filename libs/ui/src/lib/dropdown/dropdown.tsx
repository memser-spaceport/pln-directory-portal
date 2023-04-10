import { Listbox } from '@headlessui/react';
import React, { Fragment, useEffect, useState } from 'react';
import { ArrowIcon } from '../icons/arrow/arrow';

export interface DropdownProps {
  buttonContent?: React.ReactNode;
  initialOption?: IDropdownOption;
  onChange?: (value: IDropdownOption, name?: string) => void;
  placeholder?: string;
  options: IDropdownOption[];
  value?: IDropdownOption;
  name?: string;
  required?: boolean;
}

export interface IDropdownOption {
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value?: string;
}

export function Dropdown({
  options = [],
  onChange,
  initialOption = options?.[0],
  buttonContent,
  name,
  value,
  required = false,
  placeholder = 'Select a value... ',
}: DropdownProps) {
  const [selectedOption, setSelectedOption] = useState(initialOption);
  const requiredIndicator =
    required && !selectedOption?.value ? 'border custom-red' : '';

  function onChangeHandler(value: string) {
    const selectedDropdownOption = options.find(
      (option) => option.value === value
    );

    if (selectedDropdownOption) {
      setSelectedOption(selectedDropdownOption);
      onChange && onChange(selectedDropdownOption, name);
    }
  }

  useEffect(() => {
    if (value !== undefined) setSelectedOption(value);
  }, [setSelectedOption, value]);

  return (
    <Listbox
      as="div"
      name={name}
      value={selectedOption?.value}
      onChange={onChangeHandler}
      placeholder="Enter value"
      className="w-full text-sm"
    >
      {({ open }) => (
        <div className="relative">
          <Listbox.Button
            className={`on-focus hover:shadow-on-hover flex h-10 w-full items-center rounded-lg border border-white bg-white px-3 shadow-sm shadow-slate-300 transition duration-150 ease-in-out active:border-blue-600 active:ring-2 active:ring-blue-300 ${
              open ? 'border-blue-600 ring-2 ring-blue-300' : ''
            } ${requiredIndicator}`}
            data-testid="dropdown__button"
          >
            {buttonContent ? (
              buttonContent
            ) : selectedOption?.label ? (
              <div className="text-left leading-6">{selectedOption?.label}</div>
            ) : (
              <div className="text-sm text-slate-400">{placeholder}</div>
            )}
            <div className="absolute right-4">
              <ArrowIcon />
            </div>
          </Listbox.Button>

          <Listbox.Options
            as="div"
            className="absolute z-20 mt-2 h-[14rem] w-full space-y-1 overflow-y-auto rounded-lg bg-white p-2 leading-6 shadow-md focus:outline-none"
          >
            {options.map((option) => {
              const OptionIcon = option.icon;

              return (
                <Listbox.Option
                  as={Fragment}
                  key={option.value}
                  value={option.value}
                >
                  {({ active, selected }) => (
                    <div
                      className={`${
                        selected
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-white bg-white'
                      } ${
                        !selected && active
                          ? 'border-slate-100 bg-slate-100 active:border-blue-600 active:bg-white active:ring-2 active:ring-blue-300'
                          : ''
                      }
                      relative cursor-pointer select-none overflow-hidden rounded-lg border py-1 pl-8 pr-4 transition duration-150 ease-in-out`}
                    >
                      {OptionIcon && (
                        <OptionIcon
                          className={`${
                            selected ? 'text-white' : ''
                          } pointer-events-none absolute inset-y-0 left-2 my-auto h-4`}
                        />
                      )}
                      {option.label}
                    </div>
                  )}
                </Listbox.Option>
              );
            })}
          </Listbox.Options>
        </div>
      )}
    </Listbox>
  );
}
