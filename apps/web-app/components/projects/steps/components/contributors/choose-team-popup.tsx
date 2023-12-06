import { Dialog, Transition } from "@headlessui/react";
import { XCircleIcon } from "@heroicons/react/solid";
import { Fragment, useEffect, useState } from "react";
import TeamList from "./team-list";
import MemberList from "./member-list";
import Image from "next/image";
import ProjectsService from "apps/web-app/services/projects";

export default function ChooseTeamPopup({ isOpen, onClose, title, setTeamDetails, mode, teamDetails }) {

    const contriTitle = 'Select Contributors';

    const [showContributor, setContributorsFlag] = useState(mode === 'EDIT' ? true : false);
    const [popupTitle, setPopupTitle] = useState(mode === 'EDIT' ? contriTitle : title);
    const [allTeams, setAllTeams] = useState(null);
    const [selectedTeamAllMembers, setMembers] = useState(null);
    const [selectedTeam, setTeam] = useState(null);
    const [selectedMembers, setSelectedMembers] = useState([]);

    useEffect(() => {
        if(mode === 'ADD'){
            ProjectsService.fetchTeams().then(res => {
                setAllTeams(res);
            });
        }else{
            setTeam(teamDetails?.team);
            ProjectsService.fetchMembers(teamDetails?.team.uid).then((members)=>{
                setMembers(members);
                setSelectedMembers(teamDetails?.members);
            });
        }
    }, []);

    const onTeamSelect = async (team) => {
        setTeam(team);
        const members = await ProjectsService.fetchMembers(team.uid);
        setMembers(members);
        setContributorsFlag(true);
        setPopupTitle(contriTitle);
    }

    const onSave = () => {
        const details = {
            team:selectedTeam,
            members:selectedMembers
        }
        setTeamDetails(details);
        onClose(true,details);
    }


    return (
        <>
            <Transition appear show={isOpen} as={Fragment}>
                <Dialog
                    as="div"
                    className="fixed relative inset-0 left-0 top-0 z-[1000] w-full grow overflow-x-hidden outline-none"
                    onClose={() => onClose}
                >
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" />
                    </Transition.Child>
                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <Transition.Child
                                as={Fragment}
                                enter="ease-out duration-300"
                                enterFrom="opacity-0 scale-95"
                                enterTo="opacity-100 scale-100"
                                leave="ease-in duration-200"
                                leaveFrom="opacity-100 scale-100"
                                leaveTo="opacity-0 scale-95"
                            >
                                <Dialog.Panel className="relative w-full max-w-2xl transform rounded-md bg-white py-8 pl-8 text-left align-middle shadow-xl transition-all h-[645px] slim-scroll">
                                    <Dialog.Title
                                        as="h2"
                                        className="text-base not-italic font-semibold leading-[22px] pb-3"
                                    >
                                        <div className="flex justify-between pr-7">
                                            <div className="flex items-center gap-2">
                                                {
                                                    showContributor && 
                                                    mode === 'ADD' &&
                                                    <Image src='/assets/images/icons/projects/back.svg' alt="back image" width={16} height={16}
                                                        className='shrink-0 cursor-pointer'
                                                        onClick={() => {
                                                            setSelectedMembers([]);
                                                            setContributorsFlag(false);
                                                            setPopupTitle(title);
                                                        }}
                                                    />
                                                }
                                                <p className=""> {popupTitle}</p>
                                            </div>
                                            {
                                                showContributor &&
                                                <div className={`flex items-center rounded border border-#156FF7 px-3 py-1.5 border-solid 
                                                ${selectedTeamAllMembers.length > 0?'bg-[#156FF7] cursor-pointer':'bg-[#757575] cursor-not-allowed'} `}
                                                onClick={()=>{
                                                    if(selectedTeamAllMembers.length){
                                                        onSave()
                                                    }
                                                }}
                                                >
                                                    <div className={`${selectedTeamAllMembers.length > 0?'text-white':'text-white'} text-sm not-italic font-normal leading-5`}>Save</div>
                                                </div>
                                            }
                                        </div>
                                    </Dialog.Title>
                                    <>

                                        {!showContributor && <TeamList onSelect={onTeamSelect} list={allTeams} />}
                                        {showContributor &&
                                            <MemberList list={selectedTeamAllMembers}
                                                selectedMembers={selectedMembers}
                                                setSelectedMembers={setSelectedMembers} />}

                                    </>
                                    <div className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-white" />
                                    <XCircleIcon
                                        onClick={() => { onClose() }}
                                        data-testid={'close-icon'}
                                        className={
                                            'absolute -top-4 -right-4 h-8 w-8 text-slate-600'
                                        }
                                    />
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </>
    );
}