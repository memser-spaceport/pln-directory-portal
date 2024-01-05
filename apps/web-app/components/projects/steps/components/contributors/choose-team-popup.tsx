import { Dialog, Transition } from "@headlessui/react";
import { XCircleIcon } from "@heroicons/react/solid";
import { Fragment, useContext, useEffect, useState } from "react";
import TeamList from "./team-list";
import MemberList from "./member-list";
import Image from "next/image";
import ProjectsService from "apps/web-app/services/projects";
import { ContributorsContext } from "apps/web-app/context/projects/contributors.context";
import { AddProjectsContext } from "apps/web-app/context/projects/add.context";

export default function ChooseTeamPopup({ isOpen, onClose, title, setTeamDetails, mode }) {

    const contriTitle = 'Edit Contributors';
    
    
    const { contributorsState, contributorsDispatch } =
    useContext(ContributorsContext);
    
    const { addProjectsState, addProjectsDispatch } =
    useContext(AddProjectsContext);
    console.log(contributorsState.chooseTeamPopup.UIType,title);

    const [showContributor, setContributorsFlag] = useState(contributorsState.chooseTeamPopup.UIType === 'MEMBER'  ? true : false);
    const [popupTitle, setPopupTitle] = useState(contributorsState.chooseTeamPopup.UIType === 'MEMBER' ? contriTitle : title);
    const [allTeams, setAllTeams] = useState(null);
    const [selectedTeamAllMembers, setMembers] = useState(null);
    const [selectedTeam, setTeam] = useState(null);
    const [selectedMembers, setSelectedMembers] = useState([]);

    useEffect(() => {
        if (mode === 'ADD') {
          setPopupTitle(title);
          ProjectsService.fetchTeams().then((res) => {
            setAllTeams(res);
            setSelectedMembers(addProjectsState.inputs.contributors);
          });
        } else {
          if (contributorsState.chooseTeamPopup.UIType === 'TEAM') {
            ProjectsService.fetchTeams().then((res) => {
              setAllTeams(res);
            });
            setTeam(contributorsState.chooseTeamPopup.selectedTeam);
            ProjectsService.fetchMembers(
              contributorsState.chooseTeamPopup.selectedTeam?.uid
            ).then((members) => {
              setMembers(members);
              
              setSelectedMembers(addProjectsState.inputs.contributors);
            });
          } else {
            ProjectsService.fetchMembers().then((members) => {
              setMembers(members);
              setSelectedMembers(addProjectsState.inputs.contributors);
            });
          }
        }
    }, []);

    const onTeamSelect = async (team) => {
        setTeam(team);
        const members = await ProjectsService.fetchMembers(team.uid);
        setMembers(members);
        setContributorsFlag(true);
        setPopupTitle('Select Contributors');
    }

    const onSave = (skipFlag = false) => {
      let details;
      if(skipFlag){
        details = {
          team: selectedTeam,
          members: selectedMembers,
        };
      }else{
        details = {
          team: selectedTeam,
          members: selectedMembers,
        };
      }
      setTeamDetails(details);
      onClose(true, details);
    };


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
                  <Dialog.Panel className="slim-scroll relative h-[645px] w-full max-w-2xl transform rounded-md bg-white py-8 pl-8 text-left align-middle shadow-xl transition-all">
                    <Dialog.Title
                      as="h2"
                      className="pb-3 text-base font-semibold not-italic leading-[22px]"
                    >
                      <div className="flex justify-between pr-7">
                        <div className="flex items-center gap-2">
                          {showContributor &&
                            contributorsState.chooseTeamPopup.UIType ===
                              'TEAM' && (
                              <Image
                                src="/assets/images/icons/projects/back.svg"
                                alt="back image"
                                width={16}
                                height={16}
                                className="shrink-0 cursor-pointer"
                                onClick={() => {
                                  setSelectedMembers([]);
                                  setContributorsFlag(false);
                                  setPopupTitle(title);
                                }}
                              />
                            )}
                          <p className=""> {popupTitle}</p>
                        </div>
                        {showContributor && (
                          <div className="flex gap-2">
                            {contributorsState.chooseTeamPopup.UIType ===
                              'TEAM' && (
                              <div
                                className={`flex cursor-pointer items-center rounded border border-solid border-[color:var(--Primary-PL-Blue,#156FF7)] px-3 py-1.5`}
                                onClick={() => {
                                  if (selectedTeamAllMembers?.length) {
                                    onSave(true);
                                  }
                                }}
                              >
                                <div
                                  className={`text-sm font-normal not-italic leading-5 text-[color:var(--Primary-PL-Blue,#156FF7)]`}
                                >
                                  Skip & Save
                                </div>
                              </div>
                            )}
                            <div
                              className={`border-#156FF7 flex items-center rounded border border-solid px-3 py-1.5 cursor-pointer bg-[#156FF7]
                                                `}
                              onClick={() => {
                                if (selectedTeamAllMembers?.length) {
                                  onSave();
                                }
                              }}
                            >
                              <div
                                className={`${
                                  selectedTeamAllMembers?.length > 0
                                    ? 'text-white'
                                    : 'text-white'
                                } text-sm font-normal not-italic leading-5`}
                              >
                                Save
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      {contributorsState.chooseTeamPopup.UIType === 'TEAM' &&
                        showContributor && (
                          <div className="text-sm font-normal not-italic leading-7 text-[color:var(--Neutral-Slate-900,#0F172A)]">
                            Have any of these members contributed to this
                            project?
                          </div>
                        )}
                    </Dialog.Title>
                    <>
                      {!showContributor && (
                        <TeamList onSelect={onTeamSelect} list={allTeams} />
                      )}
                      {showContributor && (
                        <MemberList
                          list={selectedTeamAllMembers}
                          selectedMembers={selectedMembers}
                          setSelectedMembers={setSelectedMembers}
                          originalSelectedMembers={
                            addProjectsState.inputs.contributors
                          }
                        />
                      )}
                    </>
                    <div className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-white" />
                    <XCircleIcon
                      onClick={() => {
                        onClose();
                      }}
                      data-testid={'close-icon'}
                      className={
                        'absolute -top-4 -right-4 h-8 w-8 cursor-pointer text-slate-600'
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