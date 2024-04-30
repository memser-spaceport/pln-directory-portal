import {
  APP_ANALYTICS_EVENTS,
  FOCUS_AREAS_FILTER_KEYS,
  PAGE_ROUTES,
  URL_QUERY_VALUE_SEPARATOR,
} from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { IFocusArea } from 'apps/web-app/utils/shared.types';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import { useRouter } from 'next/router';
import { useState } from 'react';
import FocusAreaItem from './focus-area-item';

interface IFocusAreaFilter {
  uniqueKey: string;
  title: string;
  selectedItems: IFocusArea[];
  focusAreaRawData: IFocusArea[];
}

const FocusAreaFilter = (props: IFocusAreaFilter) => {
  const focusAreas = props.focusAreaRawData?.filter(
    (focusArea) => !focusArea.parentUid
  );

  const title = props?.title;
  const uniqueKey = props?.uniqueKey;
  const pageName = getPageName(uniqueKey)
  const selectedItems = props?.selectedItems ?? [];
  const parents = getAllParents(props?.selectedItems) ?? [];

  const [isHelpActive, setIsHelpActive] = useState(false);
  const { query, push, pathname } = useRouter();
  const user = getUserInfo();
  const analytics = useAppAnalytics();

  function getPageName(key: string) {
    if (key === FOCUS_AREAS_FILTER_KEYS.projects) {
      return PAGE_ROUTES.PROJECTS;
    }
    return PAGE_ROUTES.TEAMS
  }

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

  function findParents(data: IFocusArea[], childUid: string) {
    const parents = [];
    const findParentsRecursive = (
      item: IFocusArea,
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
          page: pageName,
          name: 'Focus Area',
          value: item.title,
          user,
          nameAndValue: `Focus Area - ${item.title}`,
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
    <div className=" flex flex-col gap-[16px]">
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
      </div>
      <div className="flex flex-col gap-[12px]">
        {focusAreas?.map((focusArea: IFocusArea, index: number) => (
          <div key={`${focusArea} + ${index}`} className="">
            <FocusAreaItem
              isHelpActive={isHelpActive}
              parents={parents}
              item={focusArea}
              uniqueKey = {uniqueKey}
              selectedItems={selectedItems}
              isGrandParent={true}
              onItemClickHandler={onItemClickHandler}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default FocusAreaFilter;
