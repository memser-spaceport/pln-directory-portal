import { useState, useEffect } from 'react';
import { ChevronDownIcon, XIcon as CloseIcon } from '@heroicons/react/solid';

interface Option {
  label: string;
  value: string;
}

interface MultiSelectDropdownProps {
  options: Option[];
  selectedValues: Option[];
  onChange: (selectedValues: Option[], name: string) => void;
  placeholder?: string;
  label?: string;
  name: string;
}

export function MultiSelect({
  options,
  selectedValues,
  onChange,
  placeholder,
  label,
  name,
}: MultiSelectDropdownProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [internalOptions, setInternalOptions] = useState<Option[]>(options);

  const toggleDropdown = () => {
    setIsExpanded(!isExpanded);
  };

  useEffect(() => {
    setInternalOptions(options);
  }, [setInternalOptions, options]);

  const handleOptionClick = (item: Option) => {
    // const newSelectedValues = selectedValues.includes(item)
    //   ? selectedValues.filter((selectedItem) => selectedItem.value !== item.value)
    //   : [...selectedValues, item];
    const newSelectedValues = [...selectedValues, item];
    const refreshedOption = internalOptions.filter(
      (option) => option.value !== item.value
    );
    setInternalOptions(refreshedOption);
    onChange(newSelectedValues, name);
  };

  const handleRemoveOption = (
    event: React.MouseEvent<HTMLButtonElement>,
    item: Option
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const newSelectedValues = selectedValues.filter(
      (selectedItem) => selectedItem.value !== item.value
    );
    setInternalOptions([...internalOptions, item]);
    onChange(newSelectedValues, name);
  };

  return (
    <div className="">
      {label && <span className="mb-4 text-sm font-bold">{label}</span>}
      <div
        className="mt-2.5 flex cursor-pointer items-center justify-between rounded-md border bg-white py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        onClick={toggleDropdown}
        onBlur={() => {
          console.log('evnet called');
          setIsExpanded(false);
        }}
      >
        <div className="flex flex-1 flex-wrap pr-4">
          {selectedValues?.length > 0 ? (
            selectedValues.map((item) => (
              <div
                className="m-1 flex items-center rounded-full bg-gray-100 py-1 px-2 font-semibold text-gray-600"
                key={item.value}
              >
                <span className="mr-1">{item.label}</span>
                <button
                  type="button"
                  className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300 focus:bg-gray-300 focus:outline-none"
                  onClick={(event) => handleRemoveOption(event, item)}
                >
                  <CloseIcon className="h-3 w-3" />
                </button>
              </div>
            ))
          ) : (
            <span className="pl-3 text-gray-400">
              {placeholder || 'Select...'}
            </span>
          )}
        </div>
        <ChevronDownIcon
          className={`h-5 w-5 text-gray-400 ${isExpanded ? '-rotate-180' : ''}`}
        />
      </div>
      {isExpanded && (
        <div className="relative">
          <div
            // className="absolute left-0  z-[1056] mt-1 mr-5 h-[25%] w-full overflow-y-auto rounded-md bg-white shadow-lg"
            className="absolute z-[1056] h-[250px] w-full overflow-y-auto rounded-md bg-white shadow-lg"
            onBlur={() => setIsExpanded(false)}
          >
            {internalOptions?.length > 0 ? (
              internalOptions.map((item: Option) => (
                <label
                  className="block w-full cursor-pointer px-3 py-2 text-gray-800 hover:bg-gray-100"
                  key={item.value}
                >
                  <button
                    type="button"
                    value={item.value}
                    onClick={() => handleOptionClick(item)}
                    className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                  />
                  <span className="font-medium text-gray-900">
                    {item.label}
                  </span>
                </label>
              ))
            ) : (
              <label>
                <span className="font-sm text-gray-500">
                  No options available
                </span>
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MultiSelect;