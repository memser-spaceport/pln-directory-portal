/* eslint-disable @next/next/no-img-element */
import { TFocusArea } from 'apps/back-office/utils/teams.types';
import { useState } from 'react';
import FocusArea from './focus-area';
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries


interface IFocusAreas {
  focusAreas: TFocusArea[];
  onClose: () => void;
  selectedItems: TFocusArea[];
  handleFoucsAreaSave: (items: TFocusArea[]) => void;
}

const FocusAreas = (props: IFocusAreas) => {
  const focusAreas = props.focusAreas;
  const onClose = props.onClose;
  const handleFoucsAreaSave = props.handleFoucsAreaSave;

  const [selectedItems, setSelectedItems] = useState(
    props?.selectedItems ?? []
  );
  const [parents, setParents] = useState(
    getAllParents(props?.selectedItems ?? [])
  );

  function getAllParents(items: TFocusArea[]) {
    try {
      let initialParents = [];
      items?.map((item) => {
        const parents = findParents(focusAreas, item.uid);
        if (parents?.length > 0) {
          initialParents = [...initialParents, ...parents];
        }
      });
      const uniqueItems = new Set();
      return initialParents.filter((obj) => {
        const value = obj['uid'];
        return uniqueItems.has(value) ? false : uniqueItems.add(value);
      });
    } catch (error) {
      console.error(error);
    }
  }

  function findChildrens(node: TFocusArea) {
    const children = [];
    function findChildrenRecursive(currentNode: TFocusArea) {
      if (currentNode.children && currentNode.children.length > 0) {
        currentNode.children.forEach((child) => {
          children.push(child);
          findChildrenRecursive(child);
        });
      }
    }
    findChildrenRecursive(node);
    return children;
  }

  function findParents(data: TFocusArea[], childUid: string) {
    const parents = [];
    const findParentsRecursive = (
      item: TFocusArea,
      childUid: string,
      currentParents = []
    ) => {
      if (!item || !item.children) return;
      if (item.uid === childUid) {
        parents.push(...currentParents);
        return;
      }
      const updatedParents = [...currentParents, item];
      if (item.children) {
        item.children.forEach((child) => {
          findParentsRecursive(child, childUid, updatedParents);
        });
      }
    };
    data.forEach((item) => {
      findParentsRecursive(item, childUid);
    });
    return parents;
  }

  const onItemClickHandler = (item: TFocusArea) => {
    try {
      const hasItem = selectedItems.some(
        (selectedItem) => selectedItem.uid === item.uid
      );
      if (hasItem) {
        const updatedSelectedItems = selectedItems.filter(
          (selectedItem) => selectedItem.uid !== item.uid
        );
        setSelectedItems(updatedSelectedItems);
        const parents = getAllParents(updatedSelectedItems);
        setParents(parents);
      } else {
        const childrens = findChildrens(item)
        const parents = findParents(focusAreas, item.uid);
        const idsToRemove = [...parents, ...childrens].map(data => data.uid)
        const updatedSelectedItems = [...selectedItems].filter(item =>  !idsToRemove.includes(item.uid));
        updatedSelectedItems.push(item);
        const uniqueParents = getAllParents(updatedSelectedItems);
        setSelectedItems([...updatedSelectedItems]);
        setParents([...uniqueParents]);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const getDesc = (item: TFocusArea) => {
    try {
      const childrens = findChildrens(item);
      const matchedChildren = childrens.filter((child) =>
        selectedItems.some((selectedItem) => selectedItem.uid === child.uid)
      );
      const formattedText = matchedChildren
        .map((child) => {
          return child?.title;
        })
        .join(', ');
      return formattedText;
    } catch (error) {
      console.error(error);
    }
  };

  const onSaveClickHandler = () => {
    handleFoucsAreaSave(selectedItems);
    onClose();
  };

  return (
    <>
      <div className="flex h-full flex-col justify-between gap-[20px] p-[20px]">
        <div className="flex h-full w-[100%] flex-col gap-[20px]">
          <div className="flex items-center justify-between">
            <h2 className="te text-[16px] font-[600] leading-[14px]">
              Select Focus Areas
            </h2>
            <button onClick={onClose}>
              <img
                alt="close"
                src="/assets/images/close_gray.svg"
                height={20}
                width={20}
              />
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-[10px] overflow-auto pr-[5px] pb-[10px]">
            {focusAreas?.map((val: TFocusArea, index: number) => (
              <div
                key={`${val} + ${index}`}
                className="rounded-[4px]  border border-[#CBD5E1]"
              >
                <FocusArea
                  key={index}
                  parents={parents}
                  focusAreas={focusAreas}
                  focusArea={val}
                  description={getDesc(val)}
                  selectedItems={selectedItems}
                  isGrandParent={true}
                  onItemClickHandler={onItemClickHandler}
                />
              </div>
            ))}
          </div>

          <div className="flex h-[40px] items-center justify-end ">
            <div className="flex gap-[8px]">
              <button
                onClick={onClose}
                className="flex h-[40px] items-center rounded-[60px] border border-[#CBD5E1] px-[24px] py-[10px] text-[14px] font-[500] leading-[20px] text-[#0F172A]"
              >
                Close
              </button>
              <button
                onClick={onSaveClickHandler}
                className="save-btn flex h-[40px] items-center rounded-[60px] px-[24px] py-[10px] text-[14px] font-[500] leading-[20px] text-[#ffff]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>
        {`
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

          .save-btn {
            background: linear-gradient(
              71.47deg,
              #427dff 8.43%,
              #44d5bb 87.45%
            );
          }
        `}
      </style>
    </>
  );
};

export default FocusAreas;