// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import { ITeam, TFocusArea } from 'apps/web-app/utils/teams.types';

interface IFocusAreasList {
  selectedItems: TFocusArea[];
  onOpen: (mode: string) => void;
  rawData: TFocusArea[];
  from: string;
  teamDetails: ITeam;
}

interface ISelectedAreas {
  title: string;
  index: number;
  path: string;
  firstParent: string;
}

const FocusAreasList = (props: IFocusAreasList) => {
  const selectedItems = props.selectedItems ?? [];
  const onOpen = props.onOpen;
  const rawData = props.rawData ?? [];
  const from = props?.from;
  const teamDetails = props?.teamDetails;
  const analytics = useAppAnalytics();
  const formattedRawData = getFormattedFocusArea(rawData);
  const selectedFocusAreas = getSelectedItems(
    formattedRawData,
    selectedItems
  )?.sort(
    (firstItem: ISelectedAreas, secondItem: ISelectedAreas) =>
      firstItem.index - secondItem.index
  );
  const user = getUserInfo();

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
    data.forEach((item: TFocusArea) => {
      findParentsRecursive(item, childUid);
    });
    return parents;
  }

  function getSelectedItems(
    rawData: TFocusArea[],
    selectedValues: TFocusArea[]
  ): ISelectedAreas[] {
    const selectedParents = {};
    try {
      selectedValues.forEach((selectedValue) => {
        const parents = findParents(rawData, selectedValue.uid);
        const newParents = parents.length > 0 ? parents : [selectedValue];
        const path = newParents
          .map((parent) => parent.title)
          .reverse()
          .join(' > ');
        if (!selectedParents[path]) {
          selectedParents[path] = {
            title: selectedValue.title,
            path: path || selectedValue.title,
            index: findItemIndex(formattedRawData, selectedValue),
          };
        } else {
          selectedParents[path].title += `, ${selectedValue.title}`;
        }
      });
      return Object.values(selectedParents);
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  function findItemIndex(nodes, item) {
    for (const node of nodes) {
      if (node.uid === item.uid) {
        return node.index;
      }
      if (node.children && node.children.length > 0) {
        const found = findItemIndex(node.children, item);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  function getFormattedFocusArea(focusArea: TFocusArea[]) {
    let index = 1;
    function traverse(node) {
      node.index = index++;
      if (node.children && node.children.length > 0) {
        node.children.forEach((child) => {
          traverse(child);
        });
      }
    }
    focusArea.forEach((node) => {
      traverse(node);
    });
    return focusArea;
  }

  function onEditClicked() {
    analytics.captureEvent(APP_ANALYTICS_EVENTS.FOCUS_AREA_EDIT_BTN_CLICKED, {
      from,
      user,
      team: teamDetails,
    });
    onOpen('Edit');
  }

  return (
    <div className="flex flex-col gap-3 pt-5">
      <div className="flex items-center justify-between">
        <div className="">
          <span className="mr-2 text-sm font-bold">Focus Area</span>
          <span className="h-[18px] w-6 rounded-3xl bg-[#F1F5F9] px-2 py-[2px] text-xs font-[500] leading-[14px] text-[#475569] ">
            {selectedItems.length}
          </span>
        </div>
        {selectedItems.length > 0 && (
          <button
            onClick={onEditClicked}
            className="text-sm font-semibold text-[#156FF7] "
          >
            Edit
          </button>
        )}
      </div>
      {selectedItems?.length === 0 && (
        <button
          onClick={() => onOpen('Select')}
          className="flex h-10 w-full items-center justify-center rounded-lg border border-[#156FF7] px-2 py-3 text-sm
          font-[500] leading-6 text-[#156FF7]"
        >
          Select Focus Area
        </button>
      )}
      {selectedItems?.length > 0 && (
        <div className="flex flex-col gap-2">
          {selectedFocusAreas.map((path: ISelectedAreas, index: number) => {
            return (
              <div
                key={`${path} + ${index}`}
                className="flex flex-col gap-[8px] rounded border border-[#CBD5E1] py-[14px] px-[13px]"
              >
                {path?.title !== path?.path && (
                  <div className="flex items-center gap-[4px] rounded-[2px] border-[#CBD5E1]">
                    <div
                      className={`word-break break-words text-[12px] font-[400] leading-[14px] text-[#0F172A]`}
                    >
                      {path?.path ? path.path : ''}
                    </div>
                    <div className="flex h-[16px] w-[14px] items-center justify-center ">
                      <img
                        alt="right_arrow"
                        src="/assets/images/icons/down-arrow-gray-focus.svg"
                      />
                    </div>
                  </div>
                )}

                <div
                  className={`flex flex-wrap items-center gap-[4px] ${
                    path.title !== path.path ? 'ml-[12px]' : ''
                  }`}
                >
                  {path?.title?.split(',')?.map((path, index) => (
                    <div
                      key={`${path} + ${index}`}
                      className="word-break rounded-full border border-[#CBD5E1] py-[4px] px-[8px] text-[12px] font-[400] leading-[14px] text-[#0F172A]"
                    >
                      {path}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FocusAreasList;
