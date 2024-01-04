import { InputField } from "@protocol-labs-network/ui";
import MemberRow from "./member-row";
import { SearchIcon } from '@heroicons/react/outline';
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function MemberList({
  list,
  selectedMembers,
  setSelectedMembers,
  originalSelectedMembers = [],
}) {

  const [searchTerm, setSearchTerm] = useState(null);
  const [filteredList, setFilteredList] = useState(list);
  const [selectAllFlag, setSelectAll] = useState(
    selectedMembers?.length === list?.length
  );

  const route = useRouter();

  useEffect(() => {
    if (list) {
      if (searchTerm !== null) {
        const tempList = [];
        for (let index = 0; index < list.length; index++) {
          const element = list[index];
          if (element.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            tempList.push(element);
          }
        }
        setFilteredList(tempList);
      }
    }
  }, [searchTerm]);

  useEffect(() => {
    setFilteredList(list);
  }, [list]);

  const onselect = (member) => {
    if (checkForExistance(member) === 'no-data') {
      console.log(selectedMembers);
      
      setSelectedMembers([...selectedMembers, member]);
      // if (selectedMembers.length + 1 === list.length) {
      //   setSelectAll(true);
      // }
    }
  };

  const onDeselect = (member) => {
    // console.log(route.pathname);"/projects/add"
    
    const checker = checkForExistance(member);
    if (checker !== 'no-data') {
      const temp = [...selectedMembers];
      // temp.splice(checker, 1);
      // temp[checker] = { ...temp[checker], isDeleted: true };
      checkIfPresentInOriginalList(temp[checker])
        ? (temp[checker] = { ...temp[checker], isDeleted: true })
        : temp.splice(checker, 1);
      setSelectedMembers([...temp]);
      if (selectedMembers.length + 1 !== list.length) {
        setSelectAll(false);
      }
    }
  };

  const checkIfPresentInOriginalList = (member) => {
    for (let index = 0; index < originalSelectedMembers.length; index++) {
      const element = originalSelectedMembers[index];
      if(element.uid === member.uid){
        return true;
      }
    }
    return false;
  };

  const checkForExistance = (member) => {
    for (let index = 0; index < selectedMembers.length; index++) {
      const mem = selectedMembers[index];
      if (mem.uid === member.uid && !mem.isDeleted) {
        return index;
      }
    }
    return 'no-data';
  };

  const onSelectAll = (event) => {
    setSelectAll(event.target.checked);
    if (!event.target.checked) {
      setSelectedMembers([]);
    } else {
      const tempArray = [...filteredList];
      selectedMembers?.map((mem)=>{
        for (let index = 0; index < tempArray.length; index++) {
          const element = tempArray[index];
          if(mem.uid === element.uid){
            tempArray[index] = mem;
            break;
          }
        }
      })
      setSelectedMembers(tempArray);
    }
  };

  const getSelectedCount = () => {
    const counterArr = selectedMembers?.filter(member=>{
      return !member?.isDeleted
    });
    return counterArr?.length;
  }

  return (
    <div className="flex h-[89%] flex-col gap-3 overflow-y-scroll">
      <div className="pr-5 pb-3">
        <InputField
          label="Search"
          name="searchBy"
          showLabel={false}
          icon={SearchIcon}
          placeholder={'Search'}
          className="rounded-[8px] border"
          value={searchTerm}
          onKeyUp={(event) => {
            //   if (event.key === 'Enter' || event.keyCode === 13) {
            setSearchTerm(event.currentTarget.value);
            //   }
          }}
          hasClear
          onClear={() => setSearchTerm('')}
        />
      </div>
      <div className="flex justify-between border-b pb-3 pr-5">
        {/* <input
          type="checkbox"
          className="cursor-pointer"
          onChange={onSelectAll}
          checked={selectAllFlag}
        /> */}
        <div className="text-[10px] font-semibold not-italic leading-5 text-[#0F172A]">
          {selectedMembers && getSelectedCount()} SELECTED
        </div>
        <div className="flex gap-2 text-sm font-normal not-italic leading-5 text-[color:var(--Neutral-Slate-900,#0F172A)]">
          <div className="">
            <input
              type="checkbox"
              className="cursor-pointer top-[2px] relative"
              onChange={onSelectAll}
              checked={selectAllFlag}
            />
          </div>
          <div>Show selected contributors</div>
        </div>
      </div>
      {filteredList &&
        filteredList.map((member, index) => {
          return (
            <MemberRow
              key={member + index}
              data={member}
              onselect={onselect}
              onDeselect={onDeselect}
              defaultValue={checkForExistance(member) !== 'no-data'}
            />
          );
        })}
      {filteredList && filteredList.length < 1 && (searchTerm !== '' && searchTerm !== null ) &&(
        <>No member available with that search criteria.</>
      )}
      {filteredList && filteredList.length < 1 && (searchTerm === null || searchTerm === '') && (
        <>No member available.</>
      )}
    </div>
  );
}