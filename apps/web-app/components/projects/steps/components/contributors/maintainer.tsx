import Image from "next/image";
import { useContext, useEffect, useState } from "react";
import ChooseTeamPopup from "./choose-team-popup";
import { UserGroupIcon, UserIcon } from "@heroicons/react/solid";
import { AddProjectsContext } from "apps/web-app/context/projects/add.context";
import InputError from "../input-error";

export default function Maintainer() {
    const [maintainerTeam, setMaintainer] = useState(false);

    
    const [chooseTeam, setChooseTeamFlag] = useState(false);
    const [chooseTeamMode, setChooseTeamMode] = useState('ADD');
    
    const { addProjectsState, addProjectsDispatch } = useContext(AddProjectsContext);
    
    const [maintainerTeamDetails, setMaintainerDetails] = useState(addProjectsState.inputs?.maintainedBy ?
        { team: addProjectsState.inputs?.maintainedBy, members: addProjectsState.inputs.maintainedByContributors } : null);


    useEffect(() => {
        if (maintainerTeamDetails) {
            setMaintainer(true);

            // addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, 'maintainedBy': maintainerTeamDetails.team } });
            addProjectsDispatch({
                type: 'SET_INPUT',
                payload: {
                    ...addProjectsState.inputs,
                    'maintainedBy': maintainerTeamDetails.team,
                    'maintainedByContributors': maintainerTeamDetails.members
                }
            });
        }
    }, [maintainerTeamDetails])

    const onClosePopup = (dataSelected) => {
        setChooseTeamFlag(false);
        if (dataSelected) {
            setMaintainer(true);
        }
    }

    const getAddMaintainerTemplate = () => {
        return (
          <div>
            <div className="flex justify-between gap-2 bg-white py-[8px] px-[20px]">
            {/* <div className="">+</div> */}
            <div className="text-xs font-bold not-italic leading-8 text-[#64748B]">
              MAINTAINER TEAM{' '}
            </div>
            <div
              className="flex gap-2 text-sm font-medium not-italic leading-6 text-[color:var(--elements-link,#156FF7)] cursor-pointer "
              onClick={() => {
                setChooseTeamFlag(true);
              }}
            >
              <div className="">+</div>
              <div>Add</div>
            </div>
          </div>
            <InputError content={addProjectsState.errors?.maintainedBy} />
          </div>
        );
    }

    const onEdit = async () => {
        await setChooseTeamMode('EDIT');
        setChooseTeamFlag(true);
    }

    const onMaintainerEdit = () => {
        setChooseTeamMode('ADD');
        setChooseTeamFlag(true);
    }

    const getDisplayMaintainerTemplate = () => {
        return (
            <div className="flex flex-col gap-[10px] pt-[8px] pb-[16px] bg-white rounded-[8px] ">
                <div className="flex justify-between px-[20px] text-[12px] font-bold leading-[32px] text-[#64748B]">
                    <div>
                        MAINTAINER TEAM
                    </div>
                    <div className="text-[#156FF7] text-right text-[13px] not-italic font-medium leading-5 cursor-pointer"
                        onClick={() => {
                            onMaintainerEdit();
                        }}
                    >
                        Edit
                    </div>
                </div>
                <div className="px-[20px] flex gap-[8px] pb-[24px] border-b border-[#E2E8F0]">
                    <div>
                        {
                            !maintainerTeamDetails.team?.logo &&
                            <UserGroupIcon className="w-[32px] h-[32px] fill-slate-200 bg-slate-100 rounded-full" />
                        }
                        {
                            maintainerTeamDetails.team?.logo &&
                            <Image src={maintainerTeamDetails.team?.logo} alt="tea image" width={32} height={32}
                                className='rounded-[4px] border border-[#E2E8F0] shrink-0' />
                        }
                    </div>
                    <div className="text-sm text-[#64748B] font-normal leading-8">
                        {
                            maintainerTeamDetails.team?.name
                        }
                    </div>
                </div>
                <div className="flex flex-col px-5 py-0">
                    <div className="flex justify-between items-center self-stretch ">
                        <div className="text-xs not-italic font-bold leading-8 text-[#64748B]">
                            CONTRIBUTORS ({maintainerTeamDetails.members?.length})
                        </div>
                        <div className="text-[#156FF7] text-right text-[13px] not-italic font-medium leading-5 cursor-pointer"
                            onClick={() => {
                                onEdit();
                            }}
                        >
                            Edit
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        {
                            maintainerTeamDetails.members && maintainerTeamDetails.members.map((mem, index) => {
                                return (
                                    <div key={'mem' + index}>
                                        {
                                            mem.logo &&
                                            <Image src={mem.logo} alt="tea image" width={32} height={32}
                                                className='rounded-full border border-[#E2E8F0] shrink-0' />
                                        }
                                        {
                                            !mem.logo &&
                                            <UserIcon className="w-[32px] h-[32px] fill-slate-200 bg-slate-100 rounded-full" />
                                        }
                                    </div>
                                );
                            })
                        }
                    </div>
                    <InputError content={addProjectsState.errors?.maintainedByContributors} />
                </div>
            </div>
        );
    }


    return (
        <>
            <div className="flex flex-col">
                <div>
                    <div className="">
                        {!maintainerTeam && getAddMaintainerTemplate()}
                        {maintainerTeam && getDisplayMaintainerTemplate()}
                    </div>
                </div>
                {
                    chooseTeam &&
                    <ChooseTeamPopup
                        isOpen={chooseTeam}
                        onClose={onClosePopup}
                        title='Select Maintaining Team'
                        mode={chooseTeamMode}
                        setTeamDetails={setMaintainerDetails}
                        teamDetails={maintainerTeamDetails}
                    />
                }
            </div>
        </>
    );
}