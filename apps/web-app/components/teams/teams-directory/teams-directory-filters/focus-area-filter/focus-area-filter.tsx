import React, { useState, useEffect } from 'react';
import { ReactComponent as ExpandIcon } from '../../../../../public/assets/images/icons/chevron-down-blue.svg';
import { ReactComponent as CollapseIcon } from '../../../../../public/assets/images/icons/chevron-right-grey.svg';
import { ReactComponent as InformationCircleIcon } from '../../../../../public/assets/images/icons/info_icon.svg';
import { ReactComponent as HelpActive } from '../../../../../public/assets/images/icons/help-acive.svg';
import { ReactComponent as HelpInActive } from '../../../../../public/assets/images/icons/help-inactive.svg';
import { useRouter } from 'next/router';
import { APP_ANALYTICS_EVENTS, URL_QUERY_VALUE_SEPARATOR } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';

export interface FocusAreaFilterProps {
  focusArea: any;
}

const TreeNode = ({
  node,
  onToggle,
  isHelpActive,
  selectedNodes,
  setSelectedNodes,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = (e) => {
    e.stopPropagation();
    onToggle(node);
    if(!selectedNodes.includes(node.title)){
      setIsExpanded(true);
    }
  };

  const handleNodeExpand = (e) => {
    e.preventDefault();
    setIsExpanded(!isExpanded);
  };

  const hasSelectedChildren = node?.children?.some((child) =>
    selectedNodes.includes(child.title)
  );

  return (
    node.teams?.length > 0 && (
      <div className="ml-5 w-full">
        <label
          key={node.title}
          className={`mt-[10px] h-[20px] flex w-full items-center ${
            hasSelectedChildren ? 'checkbox1' : 'checkbox'
          }`}
        >
          <input
            type="checkbox"
            className="w-full"
            checked={
              hasSelectedChildren ? 'true' : selectedNodes.includes(node.title)
            }
            onChange={handleToggle}
          />
          <div className="pl-[6px] ">
            <div className="flex items-center" onClick={handleNodeExpand}>
              {node.children.length > 0 &&
                (isExpanded ? <ExpandIcon /> : <CollapseIcon />)}
              <span className="pl-[6px] text-[12px] font-[500] leading-[14px] text-[#0F172A]">
                {node.title}
                <span className="ml-2 rounded-[2px] bg-[#F1F5F9] px-[5px] text-[10px] font-[500] leading-[14px] text-[#475569]">
                  {node.teams?.length}
                </span>
              </span>
            </div>
          </div>
        </label>
        {isHelpActive && node.description && (
          <div className="mx-1 rounded-[4px] bg-[#F1F5F9] px-2 pb-1">
            <p className="inline-flex text-[12px] font-[500] leading-[17px] text-[#475569]">
              {node.description}
            </p>
          </div>
        )}
        {isExpanded &&
          node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              onToggle={onToggle}
              isHelpActive={isHelpActive}
              selectedNodes={selectedNodes}
              setSelectedNodes={setSelectedNodes}
            />
          ))}
      </div>
    )
  );
};

const TreeView = ({ data, isHelpActive }) => {
  const [selectedNodes, setSelectedNodes] = useState([]);
  const { query, push, pathname } = useRouter();
  const analytics = useAppAnalytics();

  const getAllChildren = (nodeTitle) => {
    let children = [];
    const currentNode = findNodeByTitle(nodeTitle, data);
    if (currentNode?.children) {
      //children.push(currentNode.title);
      children = [...children, ...currentNode.children.map((v) => v.title)];
      /* currentNode.children.forEach((child) => {
        children.push(...getAllChildren(child.uid));
      }); */
    }
    return children;
  };

  const findNodeByTitle = (title, nodes) => {
    for (const node of nodes) {
      if (node.title === title) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        const foundInChildren = findNodeByTitle(title, node.children);
        if (foundInChildren) {
          return foundInChildren;
        }
      }
    }
    return null;
  };

  const getAllParents = (nodeTitle) => {
    const parents = [];
    let currentNode = findNodeByTitle(nodeTitle, data);
    while (currentNode && currentNode.parentUid) {
      const parentNode = data.find(
        (node) => node.uid === currentNode.parentUid
      );
      if (parentNode) {
        parents.push(parentNode.title);
        currentNode = parentNode;
      }
    }
    return parents;
  };

  const handleChangeRoute = (selectedNodes) => {
    const { focusAreas: queryFilterValue, ...restQuery } = query;
    push({
      pathname,
      query: {
        ...restQuery,
        ...(selectedNodes.length && {
          focusAreas: selectedNodes.join(URL_QUERY_VALUE_SEPARATOR),
        }),
      },
    });
  }

  const handleToggle = (toggledNode) => {
    let updatedNode = selectedNodes;
    if (selectedNodes.includes(toggledNode.title)) {
      updatedNode =  selectedNodes.filter((title) => title !== toggledNode.title)
      // setSelectedNodes(updatedNode);
      handleChangeRoute(updatedNode);
    } else {
      const parentNodes = getAllParents(toggledNode.title);
      const childrenNodes = getAllChildren(toggledNode.title);
      const filteredSelectedNodes = selectedNodes.filter((nodeTitle) => {
        return (
          !parentNodes.includes(nodeTitle) && !childrenNodes.includes(nodeTitle)
        );
      });
      updatedNode = [...filteredSelectedNodes, toggledNode.title];
      // setSelectedNodes(updatedNode);
      handleChangeRoute(updatedNode);
      analytics.captureEvent(APP_ANALYTICS_EVENTS.FILTERS_APPLIED, {
        page: 'Teams',
        name: 'Focus Area',
        value: toggledNode.title,
        parent: parentNodes.length>0 ? parentNodes[0] : '',
        nameAndValue: `Focus Area-${toggledNode.title}`,
      });
    }
  };

  useEffect(()=>{
    if(query?.focusAreas){
      const focusAreas = query.focusAreas;
      const queryTitlesArray =  Array.isArray(focusAreas)
      ? focusAreas
      : focusAreas?.split(URL_QUERY_VALUE_SEPARATOR);
      setSelectedNodes(queryTitlesArray);
    }
    else{
      setSelectedNodes([]);
    }
  },[query])

  return (
    <div>
      {data?.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          onToggle={handleToggle}
          isHelpActive={isHelpActive}
          selectedNodes={selectedNodes}
          setSelectedNodes={setSelectedNodes}
        />
      ))}
    </div>
  );
};

export function FocusAreaFilter({ focusArea }: FocusAreaFilterProps) {
  const [isHelpActive, setIsHelpActive] = useState(false);
  const analytics = useAppAnalytics();

  const handleHelpActiveClick = () => {
    setIsHelpActive(!isHelpActive);
    if(!isHelpActive){
      analytics.captureEvent(APP_ANALYTICS_EVENTS.TEAM_FOCUS_AREA_HELP_CLICKED);
    }
  };

  return (
    <div className="focus__area__filter">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm font-semibold leading-5">Focus Area</span>
        <button onClick={handleHelpActiveClick}>
          {isHelpActive ? <HelpActive  className='h-[16px] w-[16px]'/> : <HelpInActive className='h-[16px] w-[16px]'/>}
        </button>
      </div>
      <div className="-ml-5">
        <TreeView data={focusArea} isHelpActive={isHelpActive} />
      </div>
    </div>
  );
}
