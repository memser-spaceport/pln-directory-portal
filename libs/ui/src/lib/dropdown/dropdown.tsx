import { Listbox } from '@headlessui/react';
import React, { Fragment, useEffect, useState } from 'react';
import { ArrowIcon } from '../icons/arrow/arrow';
import { DiscardChangesPopup } from '../modals/confirmation';
import { UserGroupIcon } from '@heroicons/react/solid';

export interface DropdownProps {
  buttonContent?: React.ReactNode;
  initialOption?: IDropdownOption;
  onChange?: (value: IDropdownOption, name?: string) => void;
  placeholder?: string;
  options: IDropdownOption[];
  value?: IDropdownOption;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  validateBeforeChange?: boolean;
  validationFn?: (selected: IDropdownOption) => boolean;
  confirmationMessage?: string;
}

export interface IDropdownOption {
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>> | string;
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
  disabled = false,
  placeholder = 'Select a value',
  className = '',
  validateBeforeChange = false,
  validationFn,
  confirmationMessage = ''
}: DropdownProps): JSX.Element {
  const [selectedOption, setSelectedOption] = useState(initialOption);
  const [openValidationPopup, setValidationPopup] = useState(false);
  const [tempOption, setTempOption] = useState<IDropdownOption>(initialOption);
  const requiredIndicator =
    required && !selectedOption?.value ? 'border custom-red' : '';

  const teamDefaultIcon = (name === 'team') ? <UserGroupIcon className="bg-gray-200 fill-white absolute inline inset-y-0 left-2 my-auto h-6 w-6 rounded-full mr-[4px]" /> : null; 

  function onChangeHandler(value: string) {
    const selectedDropdownOption = options.find(
      (option) => option.value === value
    );

    if (selectedDropdownOption) {

      if (validateBeforeChange) {
        if (validationFn) {
          if(validationFn(selectedDropdownOption)){
            setValidationPopup(true);
            setTempOption(selectedDropdownOption);
          }else{
            changeOption(selectedDropdownOption, name);
          }
        }else{
          changeOption(selectedDropdownOption, name);
        }
      } else {
        changeOption(selectedDropdownOption, name);
      }

    }
  }

  const changeOption = (selectedDropdownOption : IDropdownOption, name : string | undefined)=> {
    setSelectedOption(selectedDropdownOption);
    onChange && onChange(selectedDropdownOption, name);
  }

  useEffect(() => {
    if (value !== undefined) setSelectedOption(value);
  }, [setSelectedOption, value]);

  const discardChangesOnClose = (flag: boolean) => {
    setValidationPopup(false);
    if (flag) {
      setSelectedOption(tempOption);
      onChange && onChange(tempOption, name);
    }
  }

  return (
    <>
      <Listbox
        as="div"
        name={name}
        value={selectedOption?.value}
        onChange={onChangeHandler}
        placeholder="Enter value"
        className="w-full text-sm"
        disabled={disabled}
      >

        {({ open }) => (
          <div className="relative">
            <Listbox.Button
              className={`on-focus flex h-10 w-full items-center rounded-lg border border-white bg-white px-3 shadow-sm shadow-slate-300 transition duration-150 ease-in-out active:border-blue-600 active:ring-2 active:ring-blue-300 disabled:bg-slate-100 ${open ? 'border-blue-600 ring-2 ring-blue-300' : ''
                } ${className} ${requiredIndicator}`}
              data-testid="dropdown__button"
            >
              {buttonContent ? (
                buttonContent
              ) : selectedOption?.label ? (
                <div className="text-left leading-6 flex">
                    {selectedOption?.icon &&
                      (<img src={selectedOption?.icon?.toString()} width={25} height={45} className='h-6 w-6 rounded-full mr-[5px]'></img>
                      )}
                    {(selectedOption?.icon === null && name === 'team') && <UserGroupIcon className="bg-gray-200 fill-white inline inset-y-0 left-2 my-auto h-6 w-6 rounded-full mr-[4px]" />}
                    <span  className={`${'relative'} ${(selectedOption?.icon || (selectedOption?.icon === null && name === 'team')) ? ' w-[153px] text-ellipsis overflow-hidden whitespace-nowrap':' width-full'}`}>{selectedOption?.label}</span></div>
              ) : (
                <div className="text-sm text-slate-600 opacity-50">
                  {placeholder}
                </div>
              )}
              <div className="absolute right-4 text-slate-500">
                <ArrowIcon />
              </div>
            </Listbox.Button>

            <Listbox.Options
              as="div"
              className="absolute z-20 mt-2 h-auto max-h-[14rem] w-full space-y-1 overflow-y-auto rounded-lg bg-white p-2 leading-6 shadow-md focus:outline-none"
            >
              {options?.length ? (
                options.map((option) => {
                  const OptionIcon = option.icon;
                  return (
                    <Listbox.Option
                      as={Fragment}
                      key={option.value}
                      value={option.value}
                    >
                      {({ active, selected }) => (
                        <div
                          className={`${selected
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-white bg-white'
                            } ${!selected && active
                              ? 'border-slate-100 bg-slate-100 active:border-blue-600 active:bg-white active:ring-2 active:ring-blue-300'
                              : ''
                            }
                      relative cursor-pointer select-none overflow-hidden rounded-lg border py-1 pl-8 pr-4 transition duration-150 ease-in-out`}
                        >
                          {(OptionIcon && typeof (OptionIcon) !== 'string') && (
                            <OptionIcon
                              className={`${selected ? 'text-white' : ''
                                } pointer-events-none absolute inset-y-0 left-2 my-auto h-4`}
                            />
                          )}
                          {(OptionIcon && typeof (OptionIcon) === 'string') && (
                            <img src={OptionIcon.toString()} width={25} height={45} className='absolute inline inset-y-0 left-2 my-auto h-6 w-6 rounded-full mr-[4px]'></img>
                          )}

                          {(OptionIcon === null && name === 'team') && teamDefaultIcon}
                          <span className={`relative ${(OptionIcon && typeof (OptionIcon) === 'string' || (OptionIcon === null && name === 'team')) ? 'left-[8px]' : ' '}`}>{option.label}</span>
                        </div>
                      )}
                    </Listbox.Option>
                  );
                })
              ) : (
                <span className="p-2 text-gray-500">No options available</span>
              )}
            </Listbox.Options>
          </div>
        )}
      </Listbox>
      <DiscardChangesPopup text={confirmationMessage} isOpen={openValidationPopup} onCloseFn={discardChangesOnClose} />
    </>
  );
}
