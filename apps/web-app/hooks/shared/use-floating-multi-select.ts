import { useEffect, useState } from 'react';

const useFloatingMultiSelect = (props: any) => {
  const items = props.items ?? [];
  const alreadySelected = props?.selectedItems ?? [];
  const sortedItems = [...items].sort((a, b) =>
    a?.toLowerCase() > b?.toLowerCase() ? 1 : -1
  );
  const [isPaneActive, setIsPaneActive] = useState(false);
  const [filteredItems, setFilteredItems] = useState([...sortedItems]);
  const [selectedItems, setSelectedItems] = useState(alreadySelected);

  const onOpenPane = () => {
    setIsPaneActive(true);
  };

  const onClosePane = () => {
    setSelectedItems(alreadySelected);
    setIsPaneActive(false);
  };

  const onClearSelection = (e: any) => {
    e.stopPropagation();
    setSelectedItems([]);
  };

  const onItemSelected = (value: string) => {
    if (selectedItems?.includes(value)) {
      setSelectedItems(selectedItems?.filter((item: string) => item !== value));
    } else {
      setSelectedItems([...selectedItems, value]);
    }
  };

  const onInputChange = (value: string) => {
    const inputValue = value?.trim();
    if (inputValue === '') {
      setFilteredItems([...items]);
    } else {
      const filteredValues = [...items].filter((v) =>
        v?.toLowerCase().includes(inputValue?.toLowerCase())
      );
      setFilteredItems([...filteredValues]);
    }
  };

  useEffect(() => {
    setSelectedItems(alreadySelected);
  }, [alreadySelected?.length]);

  useEffect(() => {
    setFilteredItems(sortedItems);
  }, [items?.length]);

  return {
    onInputChange,
    onItemSelected,
    onClearSelection,
    filteredItems,
    selectedItems,
    isPaneActive,
    setFilteredItems,
    onOpenPane,
    onClosePane
  };
};

export default useFloatingMultiSelect;
