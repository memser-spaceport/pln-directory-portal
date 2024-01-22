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
  const [disableFlag, setDisableFlag] = useState(false);
  const [selectedTeamToFitler,setSelectedTeam] = useState({ value: '', label: '',logo:'' });
  const [selectAllFlag, setSelectAll] = useState(
    selectedMembers?.length === list?.length
  );

  useEffect(() => {
    if (list) {
      if (searchTerm !== null) {
        const tempList = [];

        let comparingList;
        if(selectedTeamToFitler?.value){
          comparingList = handleTeamChange(selectedTeamToFitler,'fromSearch');
        }else{
          comparingList = list;
        }
        for (let index = 0; index < comparingList.length; index++) {
          const element = comparingList[index];
          if (element.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            tempList.push(element);
          }
        }
        setFilteredList(tempList);

        if(showSelected){
          let memberArr = [];
          if(selectedTeamToFitler?.value){
            memberArr = selectedMembers?.filter((member) => {
              const teamArr = member?.teamMemberRoles?.filter((teamMem) => {
                return selectedTeamToFitler?.value === teamMem.team?.uid;
              });
              return (
                !member?.isDeleted &&
                teamArr?.length > 0 &&
                member.name.toLowerCase().includes(searchTerm.toLowerCase())
              );
              //return !member?.isDeleted && member.name.toLowerCase().includes(searchTerm.toLowerCase() && member.team.uid === selectedTeamToFitler?.value);
            });
          }else{
            memberArr = selectedMembers?.filter((member) => {
              return !member?.isDeleted && member.name.toLowerCase().includes(searchTerm.toLowerCase());
            });
          }
          setShowSelectedMembers(memberArr);
        }
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
    }else if(selectedTeamToFitler?.value){
      memberArr = selectedMembers?.filter((member) => {
        const teamArr = member?.teamMemberRoles?.filter((teamMem) => {
          return selectedTeamToFitler?.value === teamMem.team?.uid;
        });
        return !member?.isDeleted && teamArr?.length >0 ;
      });
      if(searchTerm !== null){
        const tempList = [];
        for (let index = 0; index < memberArr.length; index++) {
          const element = memberArr[index];
          if (element.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            tempList.push(element);
          }
        }
        setShowSelectedMembers(tempList);
      }else{
        setShowSelectedMembers(memberArr);
      }
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
    setShowSelected(event.target.checked);
    if(event.target.checked){
      getShowSelectedMembers();
    }else{
      // onClearFilter();
    }
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

  const handleTeamChange = (team, from = null) => {
    setSelectedTeam(team);
    if (team) {
      if (!from) {
        setSearchTerm('');
      }
      const memberArr = selectedMembers?.filter((member) => {
        const teamArr = member?.teamMemberRoles?.filter((teamMem) => {
          return team?.value === teamMem.team?.uid;
        });
        return !member?.isDeleted && teamArr?.length > 0;
      });
      setShowSelectedMembers(memberArr);
        if(memberArr.length ===0){
          setDisableFlag(true);
        }
        else{
          setDisableFlag(false);
        }

      const tempList = [];
      for (let index = 0; index < list.length; index++) {
        const element = list[index];
        const tempRoles = element?.teamMemberRoles;
        const filtered = tempRoles.filter((teamRole) => {
          return teamRole?.team?.uid === team.value;
        });
        if (filtered && filtered.length) {
          tempList.push(element);
        }
      }


      setFilteredList(tempList);
      return tempList;
    }
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

  const onClearFilter = () => {
    setSelectedTeam({ value: '', label: '',logo:'' });
    setSearchTerm(null);
    setFilteredList(list);
    setShowSelectedMembers(selectedMembers ? selectedMembers : null);
    if(selectedMembers.length ===0){
      setDisableFlag(true);
    }else{
      setDisableFlag(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex gap-2 pr-5 pb-3">
        <div className="flex w-full">
          {!selectedTeam && (
            <div>
              <Autocomplete
                name={'team'}
                className="custom-grey custom-outline-none border focus:outline-none focus:ring-transparent"
                // key={selectedTeam.label}
                placeholder="All Teams"
                selectedOption={selectedTeamToFitler}
                onSelectOption={handleTeamChange}
                debounceCall={fetchTeamsWithLogoSearchTerm}
                // validateBeforeChange={true}
                // validationFnBeforeChange={beforeChangeValidation}
                // confirmationMessage={MSG_CONSTANTS.CHANGE_CONF_MSG}
              />
            </div>
          )}
          <div className={`${!selectedTeam?'':'w-full'}`}>
            <InputField
              label="Search"
              tabIndex={-1}
              name="searchBy"
              showLabel={false}
              icon={SearchIcon}
              placeholder={'Search'}
              className="rounded-[8px] border custom-outline-none focus:outline-none"
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
          {!selectedTeam && (
            <div
              className="relative top-[10px] cursor-pointer p-3 text-[12px] text-sky-600"
              onClick={() => {
                onClearFilter();
              }}
            >
              Clear filters
            </div>
          )}
        </div>
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
              className="relative top-[2px] cursor-pointer focus:outline-none"
              onChange={onShowSelected}
              checked={showSelected}
              disabled={selectedMembers.length === 0 || disableFlag}
            />
          </div>
          <div>Show selected contributors</div>
        </div>
      </div>
      <div className=" h-[63%] overflow-y-scroll">
        {showSelected && showSelectedMembers.length > 0 && (
          <div className="relative mr-5 pb-3">
            <div className="flex flex-col gap-2">
              {showSelectedMembers &&
                showSelectedMembers.map((member, index) => {
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
            </div>
            {/* <div className="flex flex-col gap-2">
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
                            defaultValue={
                              checkForExistance(member) !== 'no-data'
                            }
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
            </div> */}
            {/* {showSelectedMembers && showSelectedMembers.length > 3 && !seeMore && (
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
            )} */}
          </div>
        )}
        {showSelected && showSelectedMembers.length === 0 &&
          (searchTerm !== null && searchTerm !== '') && 
              <>No search results found.</>
            }
        <div className=" flex flex-col gap-2">
          {filteredList && !showSelected &&
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
        </div>
        {filteredList && !showSelected &&
          filteredList.length < 1 &&
          searchTerm !== '' &&
          searchTerm !== null && <>No search results found.</>}
        {filteredList &&
          filteredList.length < 1 &&
          (searchTerm === null || searchTerm === '') && (
            <>No member available.</>
          )}
      </div>
    </div>
  );
}