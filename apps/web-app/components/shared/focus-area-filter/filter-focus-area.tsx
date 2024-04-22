/* eslint-disable @next/next/no-img-element */
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { useState } from 'react';

export interface IFocusArea {
  focusArea: any;
  focusAreas: any[];
  selectedItems: any[];
  onItemClickHandler: (item: any) => void;
  parents: any[];
  isGrandParent: boolean;
  isHelpActive: boolean
}
const FocusArea = (props: IFocusArea) => {
  const focusArea = props?.focusArea;
  const focusAreas = props?.focusAreas;
  const selectedItems = props?.selectedItems || [];
  const onItemClickHandler = props?.onItemClickHandler;
  const parents = props?.parents;
  const isGrandParent = props?.isGrandParent ?? false;
  const isHelpActive = props?.isHelpActive;

  const [isExpand, setIsExpand] = useState(false);
  const isSelectedItem = selectedItems.some(
    (item: any) => item.uid === focusArea.uid
  );
  const isParent = parents.some((parent) => parent.uid === focusArea.uid);

  const onClickHandler = () => {
    setIsExpand(true);
    onItemClickHandler(focusArea);
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

  return (
    <div className={``}>
      <div>
        <div className={`flex items-center gap-[6px]`}>
          <button
            className={`flex h-[20px] min-w-[20px] w-[20px] items-center justify-center rounded-[4px] ${getStyle()}`}
            onClick={() => onClickHandler()}
          >
            {(isParent || isSelectedItem) && <img alt="mode" src={getIcon()} />}
          </button>
          {focusArea?.children.length > 0 && (

          <button
          className='min-w-[16px] min-h-[16px]'
            onClick={() => {
              setIsExpand(!isExpand);
            }}
          >
              <img

                alt="expand"
                src={`${
                  isExpand
                    ? '/assets/images/icons/chevron-down-blue.svg'
                    : '/assets/images/icons/chevron-right-grey.svg'
                }`}
              />
          </button>
            )}


          <div className="">
            <p className="text-[12px] break-words font-[500] leading-[14px]">
              {focusArea.title}
            </p>
          </div>

          {focusArea?.teamAncestorFocusAreas?.length > 0 && (
            <div className="w-fit rounded-[2px] bg-[#F1F5F9]">
              <p className="px-[5px] text-[10px] font-[500] leading-[14px] text-[#475569]">
                {focusArea?.teamAncestorFocusAreas?.length}
              </p>
            </div>
          )}
        </div>
        {isHelpActive && isGrandParent && focusArea.description && (
                <div className="mx-1 rounded-[4px] bg-[#F1F5F9] px-2 pb-1">
                  <p className="inline-flex text-[12px] font-[500] leading-[17px] text-[#475569]">
                    {focusArea.description}
                  </p>
                </div>
              )}
      </div>
      {isExpand && (
        <>
          {focusArea?.children?.length > 0 && (
            <div className="pl-[26px] flex flex-col gap-[12px] mt-[12px]">
              {focusArea?.children?.map((chil, index) => (
                ((chil?.teamAncestorFocusAreas?.length > 0 || chil?.children?.length>0) && <div key={`${index}+ ${chil}`}>
                  <FocusArea
                    parents={parents}
                    focusAreas={focusAreas}
                    focusArea={chil}
                    isGrandParent={false}
                    isHelpActive={false}
                    selectedItems={selectedItems}
                    onItemClickHandler={onItemClickHandler}
                  />
                </div>)
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FocusArea;
