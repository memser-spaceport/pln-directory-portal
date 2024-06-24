import { useEffect, useState } from 'react';

const useTagsPicker = (props: any) => {
  const defaultItems = props?.defaultItems ?? [];
  const alreadySelected = props?.selectedItems;

  const [selectedItems, setSelectedItems] = useState(alreadySelected);
  const [filteredOptions, setFilteredOptions] = useState(defaultItems);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  const onInputChange = (e: any) => {
    const searchText = e.target?.value ?? '';
    setInputValue(searchText);
    if(searchText===''){
      setError('');
    }
    let newDefaultItems = defaultItems;
    if (searchText) {
      newDefaultItems = defaultItems.filter((item: any) => item.toLowerCase().includes(searchText.toLowerCase()));
    }
    setFilteredOptions(newDefaultItems);
  };

  const findExactMatch = (tag: string) => {
    const tagLower = tag.toLowerCase();
    return defaultItems.find((item) => item.toLowerCase() === tagLower) || null;
  };

  const isValueExist = (tag: string) => {
    const tagLower = tag.toLowerCase();
    return selectedItems.find((item) => item.toLowerCase() === tagLower) || null;
  };

  const addCurrentInputValue = () => {
    if (inputValue.trim() !== '') {
      if (isValueExist(inputValue)) {
        setError('Tag already exists');
      } else {
        const existingValue = findExactMatch(inputValue);
        const newItem = existingValue || inputValue;
        setSelectedItems([...selectedItems, newItem]);
        setInputValue('');
        setFilteredOptions(defaultItems);
        setError('');
      }
    }
  };

  const onInputKeyDown = (e: any) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCurrentInputValue();
    }
  };

  const onItemsSelected = (value: string) => {
    if (selectedItems?.includes(value)) {
      setSelectedItems(selectedItems?.filter((item: any) => item !== value));
    } else {
      setSelectedItems([...selectedItems, value]);
    }
  };

  useEffect(() => {
    setSelectedItems(alreadySelected);
  }, [alreadySelected]);

  return {
    onItemsSelected,
    selectedItems,
    defaultItems,
    onInputChange,
    onInputKeyDown,
    inputValue,
    error,
    filteredOptions,
    addCurrentInputValue,
  };
};

export default useTagsPicker;
