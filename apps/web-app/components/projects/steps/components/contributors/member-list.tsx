import { Autocomplete, InputField } from "@protocol-labs-network/ui";
import MemberRow from "./member-row";
import { SearchIcon } from '@heroicons/react/outline';
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import api from "apps/web-app/utils/api";

export default function MemberList({
  list,
  selectedMembers,
  setSelectedMembers,
  originalSelectedMembers = [],
  selectedTeam
}) {

  const [searchTerm, setSearchTerm] = useState(null);
  const [showSelectedMembers, setShowSelectedMembers] = useState(
    selectedMembers ? selectedMembers : null
  );
  const [seeMore, setSeeMore] = useState(false);
  const [showSelected, setShowSelected] = useState(false);
  const [filteredList, setFilteredList] = useState(list);
  const [selectedTeamToFitler,setSelectedTeam] = useState({ value: '', label: '',logo:'' });
  const [selectAllFlag, setSelectAll] = useState(
    selectedMembers?.length === list?.length
  );

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

  const getShowSelectedMembers = () => {
    let memberArr = [];
    if (selectedTeam) {
      memberArr = selectedMembers?.filter((member) => {
        const teamArr = member?.teamMemberRoles?.filter((teamMem) => {
          return selectedTeam?.uid === teamMem.team?.uid;
        });
        return !member?.isDeleted && teamArr?.length >0 ;
      });
      setShowSelectedMembers(memberArr);
    }else{
      memberArr = selectedMembers?.filter((member) => {
        return !member?.isDeleted;
      });
      setShowSelectedMembers(memberArr);
    }
  };

  const onselect = (member) => {
    if (checkForExistance(member) === 'no-data') {
      // console.log(selectedMembers);
      
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

  const onShowSelected = (event) => {
    if(event.target.checked){
      getShowSelectedMembers();
    }
    setShowSelected(event.target.checked);
  }

  const getSelectedCount = () => {
    let counterArr = [];
    if (!selectedTeam) {
      counterArr = selectedMembers?.filter((member) => {
        return !member?.isDeleted;
      });
    } else {
      counterArr = selectedMembers?.filter((member) => {
        const teamArr = member?.teamMemberRoles?.filter((teamMem) => {
          return selectedTeam?.uid === teamMem.team?.uid;
        });
        return !member?.isDeleted && teamArr?.length;
      });
    }
    return counterArr?.length;
  };

  const handleTeamChange = (team) => {
    // setSelectedTeam(team);
    // if(team){
    //   const tempList = [];
    //     for (let index = 0; index < filteredList.length; index++) {
    //       const element = filteredList[index];
    //       const tempRoles = element?.teamMemberRoles;
    //       const filtered = tempRoles.filter(teamRole=>{
    //         return teamRole?.team?.uid === team.value
    //       });
    //       if(filtered && filtered.length){
    //         tempList.push(element);
    //       }
    //     }
    //     setFilteredList(tempList);
    //   }
  };

  const fetchTeamsWithLogoSearchTerm = async (searchTerm) => {
    try {
      const response = await api.get(
        `/v1/teams?name__icontains=${searchTerm}&select=uid,name,shortDescription,logo.url,industryTags.title`
      );
      if (response.data) {
        return response.data.map((item) => {
          return {
            value: item.uid,
            label: item.name,
            logo: item?.logo?.url ? item.logo.url : null,
          };
        });
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="pr-5 pb-3 flex gap-2">
        <div className="w-[60%]">
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
        <Autocomplete
          name={'team'}
          className="custom-grey custom-outline-none border"
          // key={selectedTeam.label}
          placeholder="Select Team"
          selectedOption={selectedTeamToFitler}
          onSelectOption={handleTeamChange}
          debounceCall={fetchTeamsWithLogoSearchTerm}
          // validateBeforeChange={true}
          // validationFnBeforeChange={beforeChangeValidation}
          // confirmationMessage={MSG_CONSTANTS.CHANGE_CONF_MSG}
        />
      </div>
      <div className="mr-5 flex justify-between border-b pb-3">
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
              className="relative top-[2px] cursor-pointer"
              onChange={onShowSelected}
              checked={showSelected}
            />
          </div>
          <div>Show selected contributors</div>
        </div>
      </div>
      <div className=" h-[63%] overflow-y-scroll">
        {showSelected && showSelectedMembers.length > 0 && (
          <div className="relative mr-5 border-b pb-3">
            {showSelectedMembers &&
              showSelectedMembers.slice(0, 3).map((member, index) => {
                return (
                  <React.Fragment key={member + index}>
                    {!member?.isDeleted && (
                      <MemberRow
                        key={member + index}
                        data={member}
                        onselect={onselect}
                        onDeselect={onDeselect}
                        defaultValue={checkForExistance(member) !== 'no-data'}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            {showSelectedMembers &&
              seeMore &&
              showSelectedMembers
                .slice(3, showSelectedMembers.length)
                .map((member, index) => {
                  return (
                    <React.Fragment key={member + index}>
                      {!member?.isDeleted && (
                        <MemberRow
                          key={member + index}
                          data={member}
                          onselect={onselect}
                          onDeselect={onDeselect}
                          defaultValue={checkForExistance(member) !== 'no-data'}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
            {showSelectedMembers && showSelectedMembers.length > 3 && !seeMore && (
              <div
                className="absolute bottom-[-11px] left-[41%] cursor-pointer"
                onClick={() => {
                  setSeeMore(true);
                }}
              >
                <div className="h-[22px] rounded-[43px] border border-solid border-[#E2E8F0] bg-white px-2 text-xs font-medium not-italic leading-5 text-[#156FF7]">
                  <span className="pr-1">See more</span>
                  <Image
                    src={'/assets/images/icons/projects/see-more.svg'}
                    alt="info image"
                    width={8}
                    height={8}
                  />
                </div>
              </div>
            )}
          </div>
        )}
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
        {filteredList &&
          filteredList.length < 1 &&
          searchTerm !== '' &&
          searchTerm !== null && (
            <>No member available with that search criteria.</>
          )}
        {filteredList &&
          filteredList.length < 1 &&
          (searchTerm === null || searchTerm === '') && (
            <>No member available.</>
          )}
      </div>
    </div>
  );
}