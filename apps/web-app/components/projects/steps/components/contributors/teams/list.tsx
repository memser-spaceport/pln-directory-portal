import { UserGroupIcon, UserIcon } from '@heroicons/react/solid';
import Image from 'next/image';
import { ReactComponent as Core } from '/public/assets/images/icons/projects/core.svg';
import { useContext } from 'react';
import { AddProjectsContext } from 'apps/web-app/context/projects/add.context';
import { ContributorsContext } from 'apps/web-app/context/projects/contributors.context';

export default function ContributorTeamsList() {
  const { addProjectsState, addProjectsDispatch } =
    useContext(AddProjectsContext);
  const { contributorsState, contributorsDispatch } =
    useContext(ContributorsContext);

  const onEdit = (team,type) => {
    contributorsDispatch({
        type: 'SET_CHOOSE_TEAM_POPUP',
        payload: {
          ...contributorsState.chooseTeamPopup,
          showChooseTeamPopup: true,
          chooseTeamPopupMode: 'EDIT',
          chooseTeamPopupTitle: type === 'Maintainer' ? 'Select Maintainer Team' : 'Select Contributing Team',
          selectedTeam: team,
          UIType: 'TEAM'
        },
      });
      contributorsDispatch({
        type: 'SET_TYPE',
        payload: type,
      });
  }

  const onDelete = (selectedTeam) => {
    const index = addProjectsState.inputs.contributingTeams?.findIndex(team => team.uid === selectedTeam.uid);

    let tempTeams;
        if(index >= 0){
          tempTeams =  [
            ...addProjectsState.inputs.contributingTeams
          ];
          tempTeams.splice(index,1);
          addProjectsDispatch({
            type: 'SET_INPUT',
            payload: {
              ...addProjectsState.inputs,
              contributingTeams: tempTeams,
            },
          });
        }
        
  }

  const getRowTemplate = (teams,type) => {
    return (
      <>
        {teams &&
          teams.length > 0 &&
          teams.map((team) => {
            return (
              <div
                className="flex justify-between border-b last:border-b-0 px-[20px] py-[20px] shrink-0 "
                key={team?.uid + 'id'}
              >
                <div className="flex items-center gap-2 shrink-0 ">
                  {team?.logo && (
                    <Image
                      src={team.logo}
                      alt="tea image"
                      width={20}
                      height={20}
                      className="shrink-0 rounded"
                    />
                  )}
                  {!team?.logo && (
                    <UserGroupIcon className="h-[20px] w-[20px] shrink-0 rounded bg-slate-100 fill-slate-200" />
                  )}
                  <div className="text-sm font-normal not-italic leading-8 text-[#64748B] max-w-[665px] truncate" title={team.name}>
                    {team.name}
                  </div>
                </div>
                <div className="flex gap-3 items-center">
                  {type === 'Maintainer' && (
                    <>
                      <Core />
                      <div className="text-center text-[13px] font-normal not-italic leading-5 text-[#0F172A]">
                        Maintainer Team
                      </div>
                    </>
                  )}
                  {
                    type === 'Contributing' && (
                        <div onClick={()=>{
                            onDelete(team);
                          }}
                          className='relative top-[3px]'
                          >
                            <Image
                              src="/assets/images/icons/projects/delete-team.svg"
                              alt="delete team"
                              width={24}
                              height={24}
                              className="shrink-0 cursor-pointer"
                            />
                          </div>
                    )
                  }
                  <div onClick={()=>{
                    onEdit(team,type);
                  }} className='relative top-[3px]'>
                    <Image
                      src="/assets/images/icons/projects/edit-team.svg"
                      alt="edit team"
                      width={24}
                      height={24}
                      className="shrink-0 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            );
          })}
      </>
    );
  };

  return (
    <>
      {addProjectsState?.inputs?.maintainedBy && getRowTemplate([addProjectsState?.inputs?.maintainedBy],'Maintainer')}
      {addProjectsState?.inputs?.contributingTeams.length > 0 && getRowTemplate(addProjectsState?.inputs?.contributingTeams,'Contributing')}
    </>
  );
}
