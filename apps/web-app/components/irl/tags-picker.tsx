import { useEffect, useRef, useState } from 'react';

const TagsPicker = (props: any) => {
  //props
  const defaultItems = props?.defaultItems ?? [];
  const selectedItems = props?.selectedItems ?? [];
  const onItemsSelected = props?.onItemsSelected;
  const onInputChange = props?.onInputChange;
  const onInputKeyDown = props?.onInputKeyDown;
  const inputValue = props?.inputValue ?? '';
  const error = props?.error;
  const filteredOptions = props?.filteredOptions ?? [];
  const addCurrentInputValue = props?.addCurrentInputValue;
  const placeholder = props?.placeholder;

  //variable
  const [isPaneActive, setIsPaneActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  //method
  const togglePaneStatus = (status: boolean) => {
    setIsPaneActive(status);
  };

  const handleClickOutside = (event: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
      setIsPaneActive(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <>
      <div ref={containerRef} className="flex flex-col gap-3 relative">
        <div className="flex flex-col gap-1">
          <input
            onKeyDown={onInputKeyDown}
            onChange={onInputChange}
            onClick={() => togglePaneStatus(true)}
            value={inputValue}
            className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 placeholder:text-sm placeholder:font-[500] placeholder:text-[#475569] placeholder:opacity-40 focus:outline-none"
            placeholder={placeholder}
          />
          {isPaneActive && (
            <div className="options-shadow w-full ml-0.5 flex max-h-[190px] flex-col gap-[16px] overflow-y-auto rounded-[8px] p-4">
              {filteredOptions?.map((item: any, index: number) => (
                <div
                  className="flex cursor-pointer items-center gap-1"
                  onClick={() => onItemsSelected(item)}
                  key={`filter-item-${index}`}
                >
                  <div
                    className={`${
                      selectedItems?.includes(item)
                        ? 'flex h-5 w-5 items-center justify-center rounded bg-[#156FF7]'
                        : 'h-5 w-5 rounded border border-[#CBD5E1] bg-white'
                    }`}
                  >
                    <img className="ms__pane__list__item__check__icon" src="/assets/images/icons/tick-white.svg" />
                  </div>
                  <div
                    title={item}
                    className="max-w-[180px] overflow-hidden text-ellipsis text-sm font-[400] text-[#0F172A]"
                  >
                    {item}
                  </div>
                </div>
              ))}
              {filteredOptions?.length === 0 && inputValue && (
                <>
                  <div
                    className="flex cursor-pointer items-center gap-1 text-sm font-[400] text-[#0F172A]"
                    onClick={addCurrentInputValue}
                  >
                    <img src="/assets/images/icons/add-tag.svg" alt="plus" />
                    <span>
                      {inputValue} <span className="text-[#64748B]">(Add New)</span>
                    </span>
                  </div>
                  <p className="text-sm font-[400] text-[#0F172A]">No results found</p>
                </>
              )}
            </div>
          )}
          {error && <div className="text-sm text-red-500">{error}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {selectedItems?.map((item, index) => (
            <div
              key={index}
              className="flex h-[18px] items-center gap-1 rounded-[24px] bg-[#DBEAFE] px-2 text-xs font-[500] leading-[14px] text-[#475569]"
            >
              <div title={item} className="max-w-[250px] overflow-hidden text-ellipsis whitespace-nowrap">
                {item}
              </div>
              <button type="button" onClick={() => onItemsSelected(item)} className="flex h-full items-center">
                <img src="/assets/images/icons/close-gray.svg" alt="close" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <style jsx>
        {`
          .options-shadow {
            box-shadow: 0px 2px 6px 0px rgba(15, 23, 42, 0.16);
            background: rgba(255, 255, 255, 1);
          }
          ::-webkit-scrollbar {
            width: 6px;
            background: #f7f7f7;
          }
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          ::-webkit-scrollbar-thumb {
            background-color: #cbd5e1;
            border-radius: 10px;
          }
        `}
      </style>
    </>
  );
};

export default TagsPicker;
