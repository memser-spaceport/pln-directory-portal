import { useContext, useEffect, useState } from "react";
import ChooseTeamPopup from "./choose-team-popup";
import { UserGroupIcon, UserIcon } from "@heroicons/react/solid";
import Image from "next/image";
import { AddProjectsContext } from "apps/web-app/context/projects/add.context";
import InputError from "../input-error";
// import { ReactComponent as RemoveIcon } from '../../../public/assets/images/icons/projects/remove-kpi.svg';
import { ReactComponent as RemoveIcon } from '../../../../../public/assets/images/icons/projects/remove-kpi.svg';

export default function CollabTeams() {

    const { addProjectsState, addProjectsDispatch } = useContext(AddProjectsContext);

    const [chooseTeam, setChooseTeamFlag] = useState(false);
    const [chooseTeamMode, setChooseTeamMode] = useState('ADD');

    const [collabTeamsList, setCollabTeamList] = useState(
      addProjectsState.inputs.collabTeamsList
        ? addProjectsState.inputs.collabTeamsList
        : []
    );
    const [collabTeamDetails, setCollabDetails] = useState(null);

    // useEffect(() => {
    //     console.log(addProjectsState.inputs);
        
    //     if (collabTeamsList) {
    //         addProjectsDispatch({
    //           type: 'SET_INPUT',
    //           payload: {
    //             ...addProjectsState.inputs,
    //             collabTeamsList: collabTeamsList,
    //           },
    //         });
    //     }
    // }, [collabTeamsList])

    const onClosePopup = (dataSelected,details) => {
        if (dataSelected) {
            if(chooseTeamMode === 'ADD'){
                if(details){
                    setCollabTeamList([...collabTeamsList, details]);
                    addProjectsDispatch({
                        type: 'SET_INPUT',
                        payload: {
                          ...addProjectsState.inputs,
                          collabTeamsList: [...collabTeamsList, details],
                        },
                      });
                }
            }else{
                if(details){
                    const idx = getIndex(details.team.uid);
                    if(idx > -1){
                        const temp = collabTeamsList;
                        temp[idx] = details;
                        setCollabTeamList([...temp]);
                        addProjectsDispatch({
                            type: 'SET_INPUT',
                            payload: {
                              ...addProjectsState.inputs,
                              collabTeamsList: [...temp],
                            },
                          });
                    }
                }
            }
            // setCollabDetails(null);
            // setMaintainer(true);
        }
        setChooseTeamFlag(false);
    }

    const getIndex = (teamUid) => {
     for (let index = 0; index < collabTeamsList.length; index++) {
        const element = collabTeamsList[index];
        if(element.team.uid === teamUid){
            return index;
        }
     }
     return -1;
    }
    
    const getAddCollabTemplate = () => {
        return (
            <div className="flex justify-between gap-2 bg-white py-[8px] px-[20px]">
            {/* <div className="">+</div> */}
            <div className="text-xs font-bold not-italic leading-8 text-[#64748B]">
              COLLABORATING TEAM
            </div>
            <div
              className="flex gap-2 text-sm font-medium not-italic leading-6 text-[color:var(--elements-link,#156FF7)] cursor-pointer "
              onClick={() => {
                setChooseTeamMode('ADD');
                setChooseTeamFlag(true);
            }}
            >
              <div className="">+</div>
              <div>Add</div>
            </div>
            {/* <InputError content={addProjectsState.errors?.maintainedBy} /> */}
          </div>
        );
    }

    const onEdit = (cteam) => {
        setCollabDetails(cteam)
        setChooseTeamMode('EDIT');
        setChooseTeamFlag(true);
    }


    const getMembersCount = (memberArr) => {
      const counterArr = memberArr?.filter((member) => {
        return !member?.isDeleted;
      });
      return counterArr?.length;
    };

    const getCollabDetailsTemplate = (cteam,index) => {
        const { team, members } = cteam;
        return (
            <div className="flex flex-col gap-[10px] pt-[8px] pb-[16px] bg-white rounded-[8px] " key={team.uid}>
                <div className="flex justify-between px-[20px] text-[12px] font-bold leading-[32px] text-[#64748B]">
                    <div>
                        COLLABORATING TEAM
                    </div>
                    <div className="text-[#156FF7] text-right text-[13px] not-italic font-medium leading-5 cursor-pointer"
                        onClick={() => {
                            // onMaintainerEdit();
                            deleteCollabTeam(index);
                        }}
                    >
                        <RemoveIcon />
                    </div>
                </div>
                <div className="px-[20px] flex gap-[8px] pb-[24px] border-b border-[#E2E8F0]">
                    <div>
                        {
                            !team?.logo &&
                            <UserGroupIcon className="w-[32px] h-[32px] fill-slate-200 bg-slate-100 rounded-full" />
                        }
                        {
                            team?.logo &&
                            <Image src={team?.logo} alt="tea image" width={32} height={32}
                                className='rounded-[4px] border border-[#E2E8F0] shrink-0' />
                        }
                    </div>
                    <div className="text-sm text-[#64748B] font-normal leading-8">
                        {
                            team?.name
                        }
                    </div>
                </div>
                <div className="flex flex-col px-5 py-0">
                    <div className="flex justify-between items-center self-stretch ">
                        <div className="text-xs not-italic font-bold leading-8 text-[#64748B]">
                            CONTRIBUTORS ({getMembersCount(members)})
                        </div>
                        <div className="text-[#156FF7] text-right text-[13px] not-italic font-medium leading-5 cursor-pointer"
                            onClick={() => {
                                onEdit(cteam);
                            }}
                        >
                            Edit
                        </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {
                            members && members.map((mem, index) => {
                                return (
                                    <>
                                    {mem && !mem.isDeleted &&
                                        <div key={'mem' + index} className="min-w-[32px] shrink-0">
                                        {
                                            mem.logo &&
                                            <Image src={mem.logo} alt="tea image" width={32} height={32}
                                                className='rounded-full border border-[#E2E8F0] shrink-0' />
                                        }
                                        {
                                            !mem.logo &&
                                            <UserIcon className="w-[32px] h-[32px] fill-slate-200 bg-slate-100 rounded-full min-w-[32px] shrink-0" />
                                        }
                                    </div>
                                    }
                                    </>
                                );
                            })
                        }
                    </div>
                    <InputError content={addProjectsState.errors?.collabContributors?.[index]} />
                </div>
            </div>
        );
    }

    const deleteCollabTeam = (index)=>{
        const tempCollab = [...collabTeamsList];
        const filtered = tempCollab.filter((ct,inx)=> inx !== index);
        setCollabTeamList(filtered);
        addProjectsDispatch({
            type: 'SET_INPUT',
            payload: {
              ...addProjectsState.inputs,
              collabTeamsList: [...filtered],
            },
          });
    }

    return (
        <>
            {
                collabTeamsList && collabTeamsList.map((cTeam, index) => {
                    return getCollabDetailsTemplate(cTeam, index); 
                })
            }
            {getAddCollabTemplate()}
            {
                chooseTeam &&
                <ChooseTeamPopup
                    isOpen={chooseTeam}
                    onClose={onClosePopup}
                    title='Select Collaborating Team'
                    mode={chooseTeamMode}
                    setTeamDetails={setCollabDetails}
                    // teamDetails={collabTeamDetails}
                />
            }
        </>
    );
}