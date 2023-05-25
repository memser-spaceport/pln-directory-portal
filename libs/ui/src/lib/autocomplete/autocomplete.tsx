import { useEffect, useMemo, useRef, useState } from 'react';
import { InputField } from '../input-field/input-field';
import { ReactComponent as ArrowDown } from '../../assets/icons/arrow-down-filled.svg';
import { debounce } from 'lodash';

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
  const [searchTerm, setSearchTerm] = useState<string>(selectedOption.label);
  const [filteredOptions, setFilteredOptions] = useState<IDropdownOption[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [selectedValue, setSelectedValue] =
    useState<IDropdownOption>(selectedOption);
  const [isExpanded, setIsExpanded] = useState(false);
  const dropdownOptionsRef = useRef<HTMLDivElement>(null);
  const excludeList = excludeValues?.filter(
    (item) => item !== selectedValue.value
  );

  useMemo(() => {
    if (searchTerm === '') {
      setSearchTerm(selectedOption.label);
    }
  }, [selectedOption.label]);

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

  // Define the debounced function
  const debouncedGetData = debounce((searchTerm) => {
    debounceCall(searchTerm).then((res: IDropdownOption[]) => {
      const availableTeams = res?.filter((item) =>
        excludeList?.every((filterItem) => filterItem !== item.value)
      );
      setFilteredOptions(availableTeams);
      setIsProcessing(false);
    });
  }, debounceTime);

  useEffect(() => {
    if (isExpanded) {
      setIsProcessing(true);
      // Call the debounced function when the searchTerm changes
      debouncedGetData(searchTerm);

      // Cleanup: Cancel any pending debounced calls
      return () => {
        debouncedGetData.cancel();
      };
    } else {
      return;
    }
  }, [searchTerm, excludeValues, isExpanded]);

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
            ) : isProcessing ? (
              <li className="text-gray-500">Searching</li>
            ) : (
              <li className="text-gray-500">No options available</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
