import { Listbox } from '@headlessui/react';
import React, { Fragment, useState } from 'react';
import { ArrowIcon } from '../icons/arrow/arrow';

interface DropdownProps {
  buttonContent?: React.ReactNode;
  initialOption?: IDropdownOption;
  onChange?: (value: IDropdownOption) => void;
  options: IDropdownOption[];
}

export interface IDropdownOption {
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
}

export function Dropdown({
  options,
  onChange,
  initialOption = options[0],
  buttonContent,
}: DropdownProps) {
  const [selectedOption, setSelectedOption] = useState(initialOption);

  function onChangeHandler(value: string) {
    const selectedDropdownOption = options.find(
      (option) => option.value === value
    );

    if (selectedDropdownOption) {
      setSelectedOption(selectedDropdownOption);
      onChange && onChange(selectedDropdownOption);
    }
  }

  return (
    <Listbox
      as="div"
      value={selectedOption.value}
      onChange={onChangeHandler}
      className="text-sm"
    >
      {({ open }) => (
        <div className="relative">
          <Listbox.Button
            className={`flex h-10 items-center rounded-lg border border-white bg-white px-3 shadow-sm shadow-slate-300 transition duration-150 ease-in-out hover:border-slate-200 hover:ring-2 hover:ring-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300 active:border-blue-600 active:ring-2 active:ring-blue-300 ${
              open
                ? 'border-blue-600 ring-2 ring-blue-300 hover:border-blue-600'
                : ''
            }`}
            data-testid="dropdown__button"
          >
            {buttonContent ? (
              buttonContent
            ) : (
              <div className="leading-6">{selectedOption.label}</div>
            )}
            <div className="ml-4">
              <ArrowIcon />
            </div>
          </Listbox.Button>

          <Listbox.Options
            as="div"
            className="absolute z-20 mt-2 w-full space-y-1 rounded-lg bg-white p-2 leading-6 shadow-md focus:outline-none"
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
