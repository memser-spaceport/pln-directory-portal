/* eslint-disable @next/next/no-img-element */
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { TFocusArea } from 'apps/web-app/utils/teams.types';
import { useState } from 'react';

export interface IFocusArea {
  focusArea: TFocusArea;
  focusAreas: TFocusArea[];
  selectedItems: TFocusArea[];
  onItemClickHandler: (item: TFocusArea) => void;
  parents: TFocusArea[];
  isGrandParent: boolean;
  description: string;
}
const FocusArea = (props: IFocusArea) => {
  const focusArea = props?.focusArea;
  const focusAreas = props?.focusAreas;
  const selectedItems = props?.selectedItems || [];
  const onItemClickHandler = props?.onItemClickHandler;
  const parents = props?.parents;
  const isGrandParent = props?.isGrandParent ?? false;
  const description = props?.description;

  const [isExpand, setIsExpand] = useState(false);
  const isSelectedItem = selectedItems.some((item: TFocusArea) => item.uid === focusArea.uid);
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
      <div
        className={`flex flex-col justify-center gap-[4px] py-[12px]  ${
          isExpand && isGrandParent ? 'border-b border-b-[#CBD5E1]' : ''
        }`}
      >
        <div className={`flex items-center gap-[10px] px-[16px]`}>
          <button
            className={`flex h-[20px] w-[20px] items-center justify-center rounded-[4px] ${getStyle()}`}
            onClick={() => onClickHandler()}
          >
            {(isParent || isSelectedItem) && <img alt="mode" src={getIcon()} />}
          </button>
          <button
            onClick={() => {
              setIsExpand(!isExpand);
            }}
          >
            {focusArea?.children.length > 0 && (
              <img
                alt="expand"
                src={`${
                  isExpand
                    ? '/assets/images/icons/down_arrow_blue.svg'
                    : '/assets/images/icons/right_arrow_blue.svg'
                }`}
              />
            )}
          </button>

          <div className='max-w-[85%] break-words'>
          <p className="text-[14px] font-[500] leading-[24px]">{focusArea.title}</p>
          </div>

          {focusArea?.teamAncestorFocusAreas?.length > 0 && (
            <div className="w-fit rounded-[2px] bg-[#F1F5F9]">
              <p className="px-[5px] text-[10px] font-[500] leading-[14px] text-[#475569]">
                {focusArea?.teamAncestorFocusAreas?.length}
              </p>
            </div>
          )}
        </div>

        {isGrandParent && (
          <>
            {description && (
              <p className="px-[16px] text-[12px] font-[500] text-[#4D4D4D] break-words">
                <span className="font-[600]">Selected:</span> {description}
              </p>
            )}
          </>
        )}
      </div>
      {isExpand && (
        <>
          {focusArea?.children?.length > 0 && (
            <div className=" ml-[26px] border-l border-l-[#CBD5E1]">
              {focusArea?.children?.map((chil, index) => (
                <div key={`${index}+ ${chil}`}>
                  <FocusArea
                    parents={parents}
                    focusAreas={focusAreas}
                    focusArea={chil}
                    description=''
                    isGrandParent={false}
                    selectedItems={selectedItems}
                    onItemClickHandler={onItemClickHandler}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FocusArea;