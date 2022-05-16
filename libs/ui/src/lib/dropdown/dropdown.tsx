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
    } else {
      throw new Error('🚫 The provided option is not valid');
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
          className={`flex items-center rounded-lg border bg-white px-3 h-10 border-slate-300 focus:outline-none focus:ring focus:ring-sky-300/30 focus:border-sky-300 transition ease-in-out duration-150 `}
          data-testid="dropdown__button"
        >
          {buttonContent ? (
            buttonContent
          ) : (
            <div className="leading-6">{selectedOption.label}</div>
          )}
          <ChevronDownIcon className="h-4 ml-5 pointer-events-none" />
        </Listbox.Button>

        <Listbox.Options
          as="div"
          className="absolute w-full rounded-lg bg-white border border-slate-300 mt-1 leading-6 shadow-md focus:outline-none"
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
                    select-none relative py-1 pl-8 pr-4 first:rounded-t-lg last:rounded-b-lg overflow-hidden cursor-pointer`}
                >
                  {selected && (
                    <CheckIcon
                      className={`${
                        active ? 'text-white' : 'text-sky-600'
                      } h-4 absolute inset-y-0 left-2 my-auto pointer-events-none`}
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
