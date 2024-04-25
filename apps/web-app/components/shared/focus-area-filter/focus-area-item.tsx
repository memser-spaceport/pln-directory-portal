/* eslint-disable @next/next/no-img-element */
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { IFocusArea } from 'apps/web-app/utils/shared.types';
import { useState } from 'react';

export interface FocusArea {
  item: IFocusArea;
  selectedItems: IFocusArea[];
  onItemClickHandler: (item: IFocusArea) => void;
  parents: IFocusArea[];
  uniqueKey: string;
  isGrandParent: boolean;
  isHelpActive: boolean;
}
const FocusAreaItem = (props: FocusArea) => {
  const currentItem = props?.item;
  const selectedItems = props?.selectedItems || [];
  const onItemClickHandler = props?.onItemClickHandler;
  const parents = props?.parents;
  const isGrandParent = props?.isGrandParent ?? false;
  const isHelpActive = props?.isHelpActive;
  const uniqueKey = props?.uniqueKey;

  const assignedItemsLength = currentItem?.[uniqueKey]?.length;
  const isChildrensAvailable = hasSelectedItems(currentItem);
  const [isExpand, setIsExpand] = useState(false);
  const isSelectedItem = selectedItems.some(
    (item) => item.uid === currentItem.uid && assignedItemsLength > 0
  );
  const isParent = parents.some(
    (parent) => parent.uid === currentItem.uid && assignedItemsLength > 0
  );
  const onCheckboxClickHandler = () => {
    if (isChildrensAvailable) {
      setIsExpand(true);
    }
    onItemClickHandler(currentItem);
  };

  const getIcon = () => {
    if (isParent) {
      return '/assets/images/icons/minus_white.svg';
    }
    return '/assets/images/icons/right_white.svg';
  };

  const getStyle = () => {
    if (isParent) return 'bg-[#156FF7]';
    if (isSelectedItem) return 'bg-[#156FF7]';
    return 'rounded-[4px] border border-[#CBD5E1]';
  };

  const onExpandClickHandler = () => {
    if (assignedItemsLength > 0) {
      setIsExpand(!isExpand);
    }
  };

  function hasSelectedItems(currentItem: IFocusArea): boolean {
    if (currentItem.children) {
      for (const child of currentItem.children) {
        if (child?.[uniqueKey]?.length > 0) {
          return true;
        }
        if (hasSelectedItems(child)) {
          return true;
        }
      }
    }
    return false;
  }

  return (
    <div>
      <div>
        <div className={`flex items-center gap-[6px]`}>
          <button
            disabled={assignedItemsLength === 0}
            className={`flex h-[20px] w-[20px] min-w-[20px] items-center justify-center rounded-[4px] ${getStyle()}`}
            onClick={() => onCheckboxClickHandler()}
          >
            {(isParent || isSelectedItem) && <img alt="mode" src={getIcon()} />}
          </button>
          <button
            disabled={!isChildrensAvailable}
            className={`min-h-[16px] min-w-[16px]`}
            onClick={onExpandClickHandler}
          >
            <img
              alt="expand"
              src={`${
                isExpand && assignedItemsLength >  0
                  ? '/assets/images/icons/chevron-down-blue.svg'
                  : '/assets/images/icons/chevron-right-grey.svg'
              }`}
            />
          </button>

          <div className="flex gap-[6px]">
            <p
              className={`word-break break-words text-[12px] font-[500] leading-[14px] ${
                assignedItemsLength === 0 ? 'text-[#94A3B8]' : ''
              }`}
            >
              {currentItem.title}
              <span className="ml-[6px] w-fit rounded-[2px] bg-[#F1F5F9] px-[5px] text-[10px] font-[500] leading-[14px] text-[#475569]">
                {assignedItemsLength}
              </span>
            </p>
          </div>
        </div>
        {isHelpActive && isGrandParent && currentItem.description && (
          <div className=" mt-[12px] rounded-[4px] bg-[#F1F5F9] p-[8px]">
            <p className="word-break text-[12px] font-[500] leading-[17px] text-[#475569]">
              {currentItem.description}
            </p>
          </div>
        )}
      </div>
      {isExpand && (
        <>
          {assignedItemsLength > 0 && (
            <>
              {currentItem?.children?.map(
                (child, index) =>
                  child?.[uniqueKey]?.length > 0 && (
                    <div
                      key={`${index}+ ${child}`}
                      className="mt-[12px] flex flex-col gap-[12px] pl-[26px]"
                    >
                      <FocusAreaItem
                        parents={parents}
                        item={child}
                        uniqueKey={uniqueKey}
                        isGrandParent={false}
                        isHelpActive={false}
                        selectedItems={selectedItems}
                        onItemClickHandler={onItemClickHandler}
                      />
                    </div>
                  )
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default FocusAreaItem;
