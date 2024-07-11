import { useMemo } from 'react';
import { TFocusArea } from 'apps/web-app/utils/teams.types';

interface TFocusAreasList {
  selectedItems: TFocusArea[];
  rawData: TFocusArea[];
}

interface ISelectedArea {
  title: string;
  index: number;
  path: string;
  firstParent: string;
}

const findParents = (data: TFocusArea[], childUid: string) => {
  const parents = [];
  const findParentsRecursive = (item: TFocusArea, childUid: string, currentParents = []) => {
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
};

const findItemIndex = (nodes, item: TFocusArea) => {
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
};

const getFormattedFocusArea = (focusArea: TFocusArea[]) => {
  let index = 1;
  const traverse = (node) => {
    node.index = index++;
    if (node.children && node.children.length > 0) {
      node.children.forEach((child) => {
        traverse(child);
      });
    }
  };
  focusArea.forEach((node) => {
    traverse(node);
  });
  return focusArea;
};

const getSelectedItems = (
  rawData: TFocusArea[],
  formattedRawData: TFocusArea[],
  selectedValues: TFocusArea[]
): ISelectedArea[] => {
  const selectedParents = {};
  try {
    selectedValues.forEach((selectedValue) => {
      const parents = findParents(rawData, selectedValue.uid);
      const newParents = parents.length > 0 ? parents : [selectedValue];
      const path = newParents.map((parent) => parent.title).join(' > ');
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
};

const FocusAreaDisplay = (props: TFocusAreasList) => {
  //props
  const selectedItems = props.selectedItems;
  const rawData = props.rawData;

  //variables
  const formattedRawData = useMemo(() => getFormattedFocusArea(rawData), [rawData]);
  const selectedFocusArea = useMemo(() => {
    return getSelectedItems(rawData, formattedRawData, selectedItems)?.sort(
      (firstItem: ISelectedArea, secondItem: ISelectedArea) => firstItem.index - secondItem.index
    );
  }, [rawData, formattedRawData, selectedItems]);
  
  return (
    <>
      <div className="focusarea">
        {selectedItems?.length > 0 && (
          <div className="focusarea__list">
            {selectedFocusArea.map((item: ISelectedArea, index: number) => {
              if (item.path === item.title) {
                return (
                  <div key={index} className="focusarea__list__item">
                    <span className='focusarea__list__item__text'>{item.path}</span>
                  </div>
                );
              } else {
                return (
                  <div className="focusarea__list__row">
                    {item.path.split('>').map((title, index) => (
                      <div key={`${title} - ${index}`} className="focusarea__list__row__path">
                        <span className="focusarea__list__row__path__text">{title}</span>
                        <img src="/assets/images/icons/projects/more-details.svg" alt="right-arrow" />
                      </div>
                    ))}
                    {item.title.split(',').map((title, index) => (
                      <div key={`${title} - ${index}`} className="focusarea__list__title">
                        {title}
                      </div>
                    ))}
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>
      <style jsx>{`
        .focusarea {
          width: 100%;
          height: auto;
        }

        .focusarea__list {
          display: flex;
          flex-direction: column;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
        }

        .focusarea__list__item {
            width: 100%;
            display: flex;
            align-items: center;
            border-bottom: 1px solid #cbd5e1;
            padding: 12px;
        }

        .focusarea__list__item__text{
            font-weight: 400;
            font-size: 12px;
            line-height: 14px;
            color: #0f172a;
            padding: 4px 8px;
            border: 1px solid #30c593;
            border-radius: 42px;
        }
        
        .focusarea__list__row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 4px;
          border-bottom: 1px solid #cbd5e1;
          padding: 12px;
        }
        .focusarea__list__row__path {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .focusarea__list__row__path__text {
          font-weight: 400;
          font-size: 12px;
          line-height: 14px;
          color: #0f172a;
          padding: 4px 8px;
          border: 1px solid #30c593;
          border-radius: 50px;
        }

        .focusarea__list__row:last-child{
            border-bottom: none;
        }

        .focusarea__list__item:last-child{
            border-bottom: none;
        }

        .focusarea__list__title {
          font-weight: 400;
          font-size: 12px;
          line-height: 14px;
          color: #0f172a;
          padding: 4px 8px;
          border: 1px solid #cbd5e1;
          border-radius: 50px;
        }
      `}</style>
    </>
  );
};

export default FocusAreaDisplay;
