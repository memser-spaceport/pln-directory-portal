const FloatingMultiSelect = (props: any) => {
  const items = props.items ?? [];
  const filteredItems = props.filteredItems ?? [];
  const sortedItems = [...filteredItems].sort((a, b) =>
    a.toLowerCase() > b.toLowerCase() ? 1 : -1
  );
  const onInputChange = props?.onInputChange;
  const onItemSelected = props?.onItemSelected;
  const selectedItems = props?.selectedItems;
  const onClearSelection = props?.onClearSelection;
  const onFilter = props?.onFilter;
  const onClosePane = props?.onClosePane;
  const setFilteredItems = props?.setFilteredItems;

  return (
    <div className="flex w-full flex-col gap-[10px] rounded-lg bg-white py-3 pl-3 pr-2 shadow-md">
      <div className="flex items-center justify-between text-[13px] font-[400] leading-6 text-[#0F172A]">
        {`FILTER (${selectedItems?.length})`}
        <button
          onClick={(e) => {
            setFilteredItems([...items]);
            onClosePane();
          }}
        >
          <img
            src="/assets/images/icons/close_gray.svg"
            alt="close"
            width={16}
            height={16}
          />
        </button>
      </div>
      <div className="mr-1 flex items-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-3">
        <div className="cursor-default">
          <img
            src="/assets/images/icons/search-grey.svg"
            alt="search"
            width={16}
            height={16}
          />
        </div>
        <input
          onChange={(e) => onInputChange(e.target?.value)}
          className="w-full flex-1 rounded-r-lg rounded-b-lg py-2 placeholder:text-sm placeholder:font-[500] placeholder:text-[#475569] focus:outline-none"
          placeholder="Search"
        />
      </div>
      <div className="flex max-h-[140px] flex-col gap-[10px] overflow-y-auto pr-1">
        {sortedItems?.map((item: any, index: number) => (
          <div
            className="flex cursor-pointer items-center justify-between"
            onClick={() => onItemSelected(item)}
            key={`filter-item-${index}`}
          >
            <div title={item} className="text-sm font-[400] text-[#0F172A] max-w-[180px] text-ellipsis overflow-hidden">{item}</div>
            <div
              className={`${
                selectedItems?.includes(item)
                  ? 'flex h-5 w-5 items-center justify-center rounded bg-[#156FF7]'
                  : 'h-5 w-5 rounded border border-[#CBD5E1] bg-white'
              }`}
            >
              <img
                className="ms__pane__list__item__check__icon"
                src="/assets/images/icons/tick-white.svg"
              />
            </div>
          </div>
        ))}
        {sortedItems?.length === 0 && (
          <span className="text-center text-sm font-[400] text-[#0F172A]">
            No Results
          </span>
        )}
      </div>
      <div className="border-t border-[#CBD5E1]">
        <div className="flex justify-between pt-[10px]">
          <button
            onClick={(e) => {
              onClearSelection(e);
              onFilter([], "reset")}}
            className="flex-1 text-sm font-[500] text-[#64748B]"
          >
            Reset
          </button>
          <button
            onClick={() => onFilter(selectedItems)}
            className="flex-1 text-sm font-[500] text-[#156FF7]"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default FloatingMultiSelect;
