import { useEffect, useRef, useState } from 'react';
import { InputField } from '../input-field/input-field';
import { ReactComponent as ArrowDown } from '../../assets/icons/arrow-down-filled.svg';

interface IDropdownOption {
  label: string;
  value?: string;
}

interface AutocompleteProps {
  selectedOption?: IDropdownOption;
  debounceTime?: number;
  name?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  excludeValues?: string[];
  onSelectOption: (option: IDropdownOption) => void;
  debounceCall: (searchTerm: string | undefined) => Promise<IDropdownOption[]>;
}

export function Autocomplete({
  onSelectOption,
  selectedOption = { value: '', label: '' },
  debounceCall,
  debounceTime = 500,
  required = false,
  disabled = false,
  className,
  placeholder,
  excludeValues = [],
  name,
}: AutocompleteProps) {
  const [searchTerm, setSearchTerm] = useState<string | undefined>(
    selectedOption?.label
  );
  const [filteredOptions, setFilteredOptions] = useState<IDropdownOption[]>([]);
  const [selectedValue, setSelectedValue] =
    useState<IDropdownOption>(selectedOption);
  const [isExpanded, setIsExpanded] = useState(false);
  const dropdownOptionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownOptionsRef.current &&
        !dropdownOptionsRef.current.contains(event.target as Node)
      ) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOptionsRef]);

  useEffect(() => {
    const getData = setTimeout(() => {
      debounceCall(searchTerm).then((res: IDropdownOption[]) => {
        const availableTeams = res?.filter((item) =>
          excludeValues?.every((filterItem) => filterItem !== item.value)
        );
        setFilteredOptions(availableTeams);
      });
    }, debounceTime);

    return () => clearTimeout(getData);
  }, [debounceCall, debounceTime, searchTerm]);

  // const handleUserInput = debounce((event: React.ChangeEvent<HTMLInputElement>) => {
  //   console.log('event', event);
  //   setSearchTerm(event.currentTarget?.value);
  //   debounceCall(searchTerm).then((res) => {
  //     setFilteredOptions(res);
  //   });
  // }, debounceTime);

  const handleUserInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.currentTarget?.value);
  };

  const checkValidData = () => {
    if (searchTerm?.trim() === '') {
      setSelectedValue({ value: '', label: '' });
      onSelectOption({ value: '', label: '' });
    } else {
      setSearchTerm(selectedValue?.label);
    }
  };

  const handleOptionClick = (option: IDropdownOption) => {
    setSelectedValue(option);
    setSearchTerm(option?.label);
    setIsExpanded(false);
    onSelectOption(option);
    setFilteredOptions([]);
  };

  // const tabClickCheck = ((event: React.ChangeEvent<HTMLInputElement>)) => {

  // }

  return (
    <div onBlur={() => checkValidData()}>
      <div className="flex">
        <InputField
          label={'te'}
          className={`mt-[12px] flex cursor-pointer items-center justify-between rounded-md border border-gray-300 bg-white py-2 px-6 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
          type="text"
          showLabel={false}
          disabled={disabled}
          onChange={handleUserInput}
          placeholder={placeholder}
          required={required}
          value={searchTerm}
          onClick={() => {
            setIsExpanded(!isExpanded);
            setSearchTerm(selectedValue.label);
          }}
          onKeyDown={(e) => e.key === 'Tab' && setIsExpanded(false)}
        />
        <div
          className="stroke-1.5 relative inset-y-0 right-6 top-[7px]
       my-auto text-slate-600"
        >
          <ArrowDown width={8} height={8} />
        </div>
      </div>

      {isExpanded && (
        <div className="relative" ref={dropdownOptionsRef}>
          <ul className="absolute z-20 mt-2 h-auto max-h-[14rem] w-full space-y-1 overflow-y-auto rounded-lg bg-white p-2 leading-6 shadow-md focus:outline-none">
            {filteredOptions?.length ? (
              filteredOptions.map((option) => (
                <li
                  className={`relative cursor-pointer select-none overflow-hidden py-1 px-2 transition duration-150 ease-in-out`}
                  key={option.value}
                  onClick={() => handleOptionClick(option)}
                >
                  {option.label}
                </li>
              ))
            ) : (
              <li className="text-gray-500">No options available</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
