import { useContext, useState } from 'react';
import ChooseTeamPopup from '../choose-team-popup';
import DefaultUI from './default';
import {
  ContributorsContext,
  ContributorsContextProvider,
} from 'apps/web-app/context/projects/contributors.context';
import { AddProjectsContext } from 'apps/web-app/context/projects/add.context';
import ContributorTeamsList from './list';
import Image from 'next/image';
import DefaultMemberUI from '../members/default';
import ContributingMembers from '../members/list';

export default function TeamsContributors() {
  const { contributorsState, contributorsDispatch } =
    useContext(ContributorsContext);
  const { addProjectsState, addProjectsDispatch } =
    useContext(AddProjectsContext);
  const [showMenu, setMenuFlag] = useState(false);

  // const [maintainerTeamDetails, setMaintainerDetails] = useState(addProjectsState.inputs?.maintainedBy ?
  //   { team: addProjectsState.inputs?.maintainedBy, members: addProjectsState.inputs.maintainedByContributors } : null);

  const onClosePopup = () => {
    contributorsDispatch({
      type: 'SET_CHOOSE_TEAM_POPUP',
      payload: {
        ...contributorsState.chooseTeamPopup,
        showChooseTeamPopup: false,
      },
    });
  };

  const onAddClick = () => {
    setMenuFlag(!showMenu);
  };

  const onMenuClick = (type) => {
    setMenuFlag(!showMenu);
    // setchooseTeam(true);
    contributorsDispatch({
      type: 'SET_CHOOSE_TEAM_POPUP',
      payload: {
        ...contributorsState.chooseTeamPopup,
        showChooseTeamPopup: true,
        chooseTeamPopupMode: 'ADD',
        chooseTeamPopupTitle: type === 'Maintainer' ? 'Select Maintainer Team' : 'Select Contributing Team',
        UIType: 'TEAM'
      },
    });

    contributorsDispatch({
      type: 'SET_TYPE',
      payload: type,
    });
  };

  const setTeamAndContributors = (details) => {
    console.log(details);
    
    if (contributorsState.chooseTeamPopup.UIType === 'TEAM') {
      console.log(checkDuplicatesAndRemove(addProjectsState.inputs.contributors,details.members));
      if (contributorsState.type === 'Maintainer') {
        addProjectsDispatch({
          type: 'SET_INPUT',
          payload: {
            ...addProjectsState.inputs,
            maintainedBy: details.team,
            // maintainedByContributors: details.members,
            // contributors: checkDuplicatesAndRemove(addProjectsState.inputs.contributors,details.members),
            contributors: [...checkDuplicatesAndRemove(addProjectsState.inputs.contributors,details.members),...details.members],
          },
        });
      } else {
        const index = addProjectsState.inputs.contributingTeams?.findIndex(team => team.uid === contributorsState.chooseTeamPopup.selectedTeam?.uid);
        
        let tempTeams;
        let tempMembers;
        if(index >= 0){
          tempTeams =  [
            ...addProjectsState.inputs.contributingTeams
          ];
          tempTeams[index] = details.team;
          tempMembers = [
            ...details.members,
          ]
        }else{
          
          tempTeams =  [
              ...addProjectsState.inputs.contributingTeams,
              details.team,
            ];
          tempMembers = [...checkDuplicatesAndRemove(addProjectsState.inputs.contributors,details.members),...details.members]
        }
        
        addProjectsDispatch({
          type: 'SET_INPUT',
          payload: {
            ...addProjectsState.inputs,
            contributingTeams: tempTeams,
            contributors: tempMembers,
          },
        });
      }
    } else {
      addProjectsDispatch({
        type: 'SET_INPUT',
        payload: {
          ...addProjectsState.inputs,
          contributors: [
            // ...addProjectsState.inputs.contributors,
            ...details.members,
          ],
        },
      });
    }
  };

  const checkDuplicatesAndRemove = (contri,incommingContri) => {
    const uids = incommingContri.map(({uid})=> uid);
    return contri.filter(({uid}) =>!uids.includes(uid))
  }

  const onContributorAddClick = () => {
    contributorsDispatch({
      type: 'SET_CHOOSE_TEAM_POPUP',
      payload: {
        ...contributorsState.chooseTeamPopup,
        showChooseTeamPopup: true,
        chooseTeamPopupMode: 'EDIT',
        UIType: 'MEMBER',
        chooseTeamPopupTitle: 'Select Contributors',
      },
    });
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between text-[12px] font-bold leading-[32px] text-[#64748B]">
          <div>TEAMS ({3})</div>
          {(addProjectsState?.inputs?.maintainedBy ||
            addProjectsState?.inputs?.contributingTeams.length > 0) && (
            <div
              className="flex cursor-pointer items-center text-sm font-medium not-italic leading-6"
              onClick={() => {
                onAddClick();
              }}
            >
              <Image
                src={'/assets/images/icons/projects/add-new.svg'}
                alt="project image"
                width={16}
                height={16}
              />
              <span className="relative px-2 text-[#156FF7] ">Add</span>
              {showMenu && (
                <div className="relative">
                  <Image
                    src={'/assets/images/icons/projects/chevron-down.svg'}
                    alt="project image"
                    width={16}
                    height={16}
                  />
                  <div
                    className="absolute right-0 z-[1] flex w-max flex-col items-start self-stretch rounded bg-white px-[8px] py-[4px] px-2 py-1 
            text-[13px] font-normal not-italic leading-5 shadow-[0px_0px_6px_0px_rgba(0,0,0,0.14)]"
                  >
                    {!addProjectsState?.inputs?.maintainedBy && (
                      <div
                        className="cursor-pointer p-[10px]"
                        onClick={() => {
                          onMenuClick('Maintainer');
                        }}
                      >
                        Maintainer Team
                      </div>
                    )}
                    <div
                      className="cursor-pointer p-[10px]"
                      onClick={() => {
                        onMenuClick('Contributor');
                      }}
                    >
                      Contributing Team
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="w-full rounded-lg bg-white">
          {!addProjectsState?.inputs?.maintainedBy &&
            addProjectsState?.inputs?.contributingTeams.length < 1 && (
              <DefaultUI
                onAddClick={onAddClick}
                onMenuClick={onMenuClick}
                showMenu={showMenu}
                setMenuFlag={setMenuFlag}
              />
            )}
          {(addProjectsState?.inputs?.maintainedBy ||
            addProjectsState?.inputs?.contributingTeams.length > 0) && (
            <ContributorTeamsList />
          )}
        </div>
        <div className="flex gap-1">
          <div>
            <Image
              src={'/assets/images/icons/info_icon.svg'}
              alt="info image"
              width={16}
              height={16}
            />
          </div>
          <div className="flex-[1_0_0] text-[13px] font-medium not-italic leading-[18px] text-[color:var(--Text-Dark,#0F172A)] opacity-40">
            Adding a maintainer team is mandatory, and only one team can serve
            as the maintainer.
          </div>
        </div>
        <div className="flex cursor-pointer justify-between text-[12px] font-bold leading-[32px] text-[#64748B]">
          <div>
            CONTRIBUTORS{' '}
            {addProjectsState?.inputs?.contributors?.length > 0 && (
              <span>({addProjectsState?.inputs?.contributors?.length})</span>
            )}
          </div>
          {addProjectsState?.inputs?.contributors?.length > 0 && (
            <div className="text-sm font-medium not-italic leading-6 text-[color:var(--Elements-Link,#156FF7)]"
            onClick={()=>{
              onContributorAddClick()
            }}
            >
              Add/Remove
            </div>
          )}
        </div>
        <div className="w-full rounded-lg bg-white">
          {addProjectsState?.inputs?.contributors?.length < 1 && (
            <DefaultMemberUI onContributorAddClick={onContributorAddClick}/>
          )}
          {addProjectsState?.inputs?.contributors?.length > 0 && (
            <ContributingMembers />
          )}
        </div>
      </div>
      {contributorsState.chooseTeamPopup.showChooseTeamPopup && (
        <ChooseTeamPopup
          isOpen={contributorsState.chooseTeamPopup.showChooseTeamPopup}
          onClose={onClosePopup}
          title={contributorsState.chooseTeamPopup.chooseTeamPopupTitle}
          mode={contributorsState.chooseTeamPopup.chooseTeamPopupMode}
          setTeamDetails={setTeamAndContributors}
          // teamDetails={contributorsState.maintainerTeamDetails}
        />
      )}
    </>
  );
}
