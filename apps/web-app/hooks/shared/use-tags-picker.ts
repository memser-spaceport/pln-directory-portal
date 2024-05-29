import { useEffect, useState } from 'react';

const useTagsPicker = (props: any) => {
  const defaultItems = props?.defaultItems ?? [];
  const alreadySelected = props?.selectedItems;

  const [selectedItems, setSelectedItems] = useState(alreadySelected);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  const onInputChange = (e: any) => {
    setInputValue(e.target?.value);
  };

  const onInputKeyDown = (e: any) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (inputValue.trim() !== '') {
        if (selectedItems?.includes(inputValue)) {
          setError('Tag already exists');
        } else {
          setSelectedItems([...selectedItems, inputValue]);
          setInputValue('');
          setError('');
        }
      }
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
  };
};

export default useTagsPicker;
