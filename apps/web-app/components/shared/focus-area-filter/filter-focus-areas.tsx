import { useState } from 'react';
import FocusArea from './filter-focus-area';
import { useRouter } from 'next/router';
import {
  URL_QUERY_VALUE_SEPARATOR,
  APP_ANALYTICS_EVENTS,
} from 'apps/web-app/constants';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';

interface IFilterFocusAreas {
  pageName: string;
  title: string;
  selectedItems: any[];
  focusAreaRawData: any[];
}

const FilterFocusAreas = (props: IFilterFocusAreas) => {
  const focusAreas = props.focusAreaRawData?.filter(
    (focusArea) => !focusArea.parentUid
  );
  const title = props?.title;
  const pageName = props?.pageName;
  const selectedItems = props?.selectedItems ?? [];

  const parents = getAllParents(props?.selectedItems) ?? [];

  const [isHelpActive, setIsHelpActive] = useState(false);
  const { query, push, pathname } = useRouter();
  const user = getUserInfo();
  const analytics = useAppAnalytics();

  function getAllParents(items: any[]) {
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

  function findChildrens(node: any) {
    const children = [];
    function findChildrenRecursive(currentNode: any) {
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

  function findParents(data: any[], childUid: string) {
    const parents = [];
    const findParentsRecursive = (
      item: any,
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

  // const  = (parentUid) => {
  //   const parentTitle = 
  // }

  const onItemClickHandler = (item: any) => {
    try {
      const { focusAreas: queryFilterValue, ...restQuery } = query;
      const hasItem = selectedItems.some(
        (selectedItem) => selectedItem.uid === item.uid
      );
      let updatedTitles = [];
      if (hasItem) {
        const updatedSelectedItems = selectedItems.filter(
          (selectedItem) => selectedItem.uid !== item.uid
        );
        updatedTitles = updatedSelectedItems.map((item) => item.title);
      } else {
        const childrens = findChildrens(item);
        const parents = findParents(focusAreas, item.uid);
        const idsToRemove = [...parents, ...childrens].map((data) => data.uid);
        const updatedSelectedItems = [...selectedItems].filter(
          (item) => !idsToRemove.includes(item.uid)
        );
        analytics.captureEvent(APP_ANALYTICS_EVENTS.FILTERS_APPLIED, {
          page: 'Teams',
          name: 'Focus Area',
          value: item.title,
          // parent: parentNodes.length>0 ? parentNodes[0] : '',
          nameAndValue: `Focus Area-${item.title}`,
        });
        updatedSelectedItems.push(item);
        updatedTitles = updatedSelectedItems.map((item) => item.title);
      }
      push({
        pathname,
        query: {
          ...restQuery,
          ...(updatedTitles.length && {
            focusAreas: updatedTitles.join(URL_QUERY_VALUE_SEPARATOR),
          }),
        },
      });
    } catch (error) {
      console.error(error);
    }
  };

  const onHelpActiveClick = () => {
    setIsHelpActive(!isHelpActive);
    if (!isHelpActive) {
      analytics.captureEvent(
        APP_ANALYTICS_EVENTS.TEAM_FOCUS_AREA_HELP_CLICKED,
        {
          page: pageName,
          user,
        }
      );
    }
  };

  return (
    <div className="mb-[20px] flex flex-col gap-[16px]">
      <div className="flex items-center gap-[4px]">
        <h2 className="text-[14px] font-[600] leading-[20px]">{title}</h2>
        <button onClick={onHelpActiveClick}>
          <img
            className="h-[16px] w-[16px]"
            src={
              isHelpActive
                ? '/assets/images/icons/help-active.svg'
                : '/assets/images/icons/help-inactive.svg'
            }
            alt="help"
          />
        </button>
        {/* <div className='bg-[#F1F5F9]  rounded-full px-[8px] py-[2px]'>
      <p className='text-[#475569] text-[12px] font-[500]'>
        {focusAreas.length}
      </p>
    </div> */}
      </div>
      <div className="flex flex-col gap-[12px]">
        {focusAreas?.map((val: any, index: number) => (
          ((val?.teamAncestorFocusAreas?.length > 0 || val?.children?.length>0) && <div key={`${val} + ${index}`} className="">
            <FocusArea
              key={index}
              isHelpActive={isHelpActive}
              parents={parents}
              focusAreas={focusAreas}
              focusArea={val}
              selectedItems={selectedItems}
              isGrandParent={true}
              onItemClickHandler={onItemClickHandler}
            />
          </div>)
        ))}
      </div>
    </div>
  );
};

export default FilterFocusAreas;
