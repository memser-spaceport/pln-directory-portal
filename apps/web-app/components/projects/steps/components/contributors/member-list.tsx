import { InputField } from "@protocol-labs-network/ui";
import MemberRow from "./member-row";
import { SearchIcon } from '@heroicons/react/outline';
import { useEffect, useState } from "react";

export default function MemberList({ list, selectedMembers, setSelectedMembers }) {

    const [searchTerm,setSearchTerm] = useState(null);
    const [filteredList,setFilteredList] = useState(list);
    const [selectAllFlag, setSelectAll] = useState(
      selectedMembers?.length === list?.length
    );

    useEffect(()=>{
      if(list){
        if(searchTerm !== null){
          const tempList = [];
          for (let index = 0; index < list.length; index++) {
            const element = list[index];
            if(element.name.includes(searchTerm)){
              tempList.push(element);
            }
          }
          setFilteredList(tempList);
        }
      }
    },[searchTerm])

    useEffect(()=>{
      setFilteredList(list);
    },[list])

    const onselect = (member) => {
        if (checkForExistance(member) === 'no-data') {
            setSelectedMembers([...selectedMembers, member]);
            if(selectedMembers.length+1 === list.length){
              setSelectAll(true);
            }
        }
    }

    const onDeselect = (member) => {
        const checker = checkForExistance(member);
        if (checker !== 'no-data') {
            const temp = [...selectedMembers];
            temp.splice(checker, 1);
            setSelectedMembers([...temp]);
            if(selectedMembers.length+1 !== list.length){
              setSelectAll(false);
            }
        }
    }

    const checkForExistance = (member) => {
        for (let index = 0; index < selectedMembers.length; index++) {
            const mem = selectedMembers[index];
            if (mem.uid === member.uid) {
                return index;
            }
        }
        return 'no-data';
    }

    const onSelectAll = (event) => {
      setSelectAll(event.target.checked);
      if(!event.target.checked){
        setSelectedMembers([]);
      }else{
        setSelectedMembers(list);
      }
    }

    return (
      <div className="flex flex-col gap-3">
        <div className="pr-5 pb-3">
          <InputField
            label="Search"
            name="searchBy"
            showLabel={false}
            icon={SearchIcon}
            placeholder={'Search'}
            className="border rounded-[8px]"
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
        <div className="flex gap-3">
          <input type="checkbox" className="cursor-pointer" onChange={onSelectAll} checked={selectAllFlag}/>
          <div className="text-[10px] not-italic font-semibold leading-5 text-[#0F172A]">
          {selectedMembers && selectedMembers.length} SELECTED
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
        {filteredList && filteredList.length < 1 && (
          <>No members were added to the team yet to select.</>
        )}
      </div>
    );
}