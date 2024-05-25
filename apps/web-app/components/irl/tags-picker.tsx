const TagsPicker = (props: any) => {
  const defaultItems = props?.defaultItems ?? [];
  const selectedItems = props?.selectedItems ?? [];
  const onItemsSelected = props?.onItemsSelected;
  const onInputChange = props?.onInputChange;
  const onInputKeyDown = props?.onInputKeyDown;
  const inputValue = props?.inputValue ?? '';
  const error = props?.error;
  const placeholder = props?.placeholder;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-[6px] lg:gap-3">
        {defaultItems.map((item, index) => (
          <div
            onClick={() => onItemsSelected(item)}
            key={index}
            className={`${
              selectedItems?.includes(item)
                ? 'border-[#156FF7] bg-[#156FF70D]'
                : ' border-[#CBD5E1] bg-[#FFFFFF]'
            } cursor-pointer rounded-lg border p-2  text-left text-sm font-[500] text-[#0F172A] lg:px-3 lg:py-2`}
          >
            {item}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <input
          onKeyDown={onInputKeyDown}
          onChange={onInputChange}
          value={inputValue}
          className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 placeholder:text-sm placeholder:font-[500] placeholder:text-[#475569] placeholder:opacity-40 focus:outline-none"
          placeholder={placeholder}
        />
        {error && <div className="text-sm text-red-500">{error}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {selectedItems?.map((item, index) => (
          <div
            key={index}
            className="flex h-[18px] items-center gap-1 rounded-[24px] bg-[#DBEAFE] px-2 text-xs font-[500] leading-[14px] text-[#475569]"
          >
            <span title={item} className="max-w-[250px] text-ellipsis overflow-hidden">{item}</span>
            <button
              type="button"
              onClick={() => onItemsSelected(item)}
              className="flex h-full items-center"
            >
              <img src="/assets/images/icons/close-gray.svg" alt="close" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TagsPicker;
