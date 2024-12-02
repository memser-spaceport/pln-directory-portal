import { Fragment, useState } from 'react';
import APP_CONSTANTS from '../utils/constants';
import MemberTable from './member-table/member-table';
import Tab from './tab/tab';

const MemberRequestList = (props: any) => {
  const dataList = props?.members;
  const [allMembers, setAllMembers]: any = useState(() => getFilterMembes(dataList ?? []));
  const [currentTab, setCurrentTab] = useState(APP_CONSTANTS.PENDING_FLAG);

  function getFilterMembes(data: any) {
    const pending = data.filter((item: any) => item.status === APP_CONSTANTS.PENDING_LABEL);
    const unverified = data.filter((item: any) =>  item.isVerified === false );
    return {
      pending,
      unverified,
    };
  }

  const availableTabs = [
    { label: APP_CONSTANTS.PENDING_LABEL, name: APP_CONSTANTS.PENDING_FLAG },
    {
      label: APP_CONSTANTS.UNVERIFIED_LABEL,
      name: APP_CONSTANTS.UNVERIFIED_FLAG,
    },
  ];

  const onTabSelected = (name: string) => {
    setCurrentTab(name);
  };

  const onTabClickHandler = (name: string) => {
    onTabSelected(name);
  }

  return (
    <div className='w-[650px]'>
      <div className="flex rounded-[8px] bg-white w-fit">
        {availableTabs.map((tab: any, index: number) => (
          <Fragment key={`${tab.label}-${index}`}>
            <Tab onClick={onTabClickHandler} name={tab.name} isSelected={tab.name === currentTab}/>
          </Fragment>
        ))}
      </div>
      <div className='mt-[14px]'>
      <MemberTable plnadmin={props?.plnadmin} setAllMembers={setAllMembers} members={allMembers[currentTab.toLowerCase()]} selectedTab={currentTab}/>
      </div>
    </div>
  );
};

export default MemberRequestList;
