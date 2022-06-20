import { Listbox } from '@headlessui/react';
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/solid';
import React, { Fragment, useState } from 'react';

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
      <div className="relative">
        <Listbox.Button
          className={`flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3 transition duration-150 ease-in-out focus:border-sky-300 focus:outline-none focus:ring focus:ring-sky-300/30 `}
          data-testid="dropdown__button"
        >
          {buttonContent ? (
            buttonContent
          ) : (
            <div className="leading-6">{selectedOption.label}</div>
          )}
          <ChevronDownIcon className="pointer-events-none ml-5 h-4" />
        </Listbox.Button>

        <Listbox.Options
          as="div"
          className="absolute mt-1 w-full rounded-lg border border-slate-300 bg-white leading-6 shadow-md focus:outline-none"
        >
          {options.map((option) => (
            <Listbox.Option
              as={Fragment}
              key={option.value}
              value={option.value}
            >
              {({ active, selected }) => (
                <div
                  className={`${
                    active ? 'bg-sky-500 text-white' : 'bg-white'
                  } ${selected && 'font-semibold'}
                    relative cursor-pointer select-none overflow-hidden py-1 pl-8 pr-4 first:rounded-t-lg last:rounded-b-lg`}
                >
                  {selected && (
                    <CheckIcon
                      className={`${
                        active ? 'text-white' : 'text-sky-600'
                      } pointer-events-none absolute inset-y-0 left-2 my-auto h-4`}
                    />
                  )}
                  {option.label}
                </div>
              )}
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </div>
    </Listbox>
  );
}
