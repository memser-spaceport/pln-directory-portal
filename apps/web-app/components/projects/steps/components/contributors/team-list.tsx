import { InputField } from "@protocol-labs-network/ui";
import TeamRow from "./team-row";
import React, { useContext, useEffect, useState } from 'react';
import { SearchIcon } from "@heroicons/react/solid";
import { AddProjectsContext } from "apps/web-app/context/projects/add.context";

export default function TeamList({ onSelect, list }) {
    const { addProjectsState, addProjectsDispatch } =
      useContext(AddProjectsContext);

    const [searchTerm,setSearchTerm] = useState(null);
    const [filteredList,setFilteredList] = useState(list);

    useEffect(()=>{
      if(list){
        if(searchTerm !== null){
          const tempList = [];
          for (let index = 0; index < list.length; index++) {
            const element = list[index];
            if(element.name.toLowerCase().includes(searchTerm.toLowerCase())){
              tempList.push(element);
            }
          }
          setFilteredList(tempList);
        }
      }
    },[searchTerm])

    useEffect(()=>{
      setFilteredList(list);
    },[list]);


    const shouldExclude = (team) => {
      
      for (let index = 0; index < addProjectsState.inputs.collabTeamsList.length; index++) {
        const element = addProjectsState.inputs.collabTeamsList[index];
        if(element?.team?.uid === team.uid){
          return true;
        }
      }
      return false;
    }

    return (
      <div className="h-[95%] overflow-y-scroll">
        <div className="pr-3 pb-3">
          <InputField
            label="Search"
            name="searchBy"
            showLabel={false}
            icon={SearchIcon}
            placeholder={'Search'}
            className="rounded-[8px] border"
            value={searchTerm}
            onKeyUp={(event) => {
              // if (event.key === 'Enter' || event.keyCode === 13) {
              setSearchTerm(event.currentTarget.value);
              // }
            }}
            hasClear
            onClear={() => setSearchTerm('')}
          />
        </div>
        {filteredList &&
          filteredList.map((team, index) => {
            return (
              <React.Fragment key={index}>
                {!shouldExclude(team) && (
                  <TeamRow onSelect={onSelect} team={team} />
                )}
              </React.Fragment>
            );
          })}
        {filteredList && filteredList.length < 1 && (
          <>No search results.</>
        )}
      </div>
    );
}