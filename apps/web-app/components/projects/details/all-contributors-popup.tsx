import { Dialog, Transition } from '@headlessui/react';
import { UserIcon, XCircleIcon } from '@heroicons/react/solid';
import { Fragment, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { InputField } from '@protocol-labs-network/ui';
import { SearchIcon } from '@heroicons/react/outline';

export default function AllContributorsPopup({
  isOpen,
  onClose,
  contributorsList,
  contributingMembers,
}) {
  const contriTitle = 'Contributors';
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredContriList, setFilteredContriList] = useState(contributorsList);
  const [filteredContriMembers, setFilteredContriMembers] = useState(contributingMembers);

  useEffect(() => {
    if (searchTerm) {
      const tempContri = contributorsList.filter((contri)=>{
        return contri?.name.toLowerCase().includes(searchTerm.toLowerCase())
      });
      setFilteredContriList(tempContri);

      const tempMembers = contributingMembers.filter((contri)=>{
        return contri?.name.toLowerCase().includes(searchTerm.toLowerCase())
      });
      setFilteredContriMembers(tempMembers);
    } else {
      setFilteredContriList(contributorsList);
      setFilteredContriMembers(contributingMembers);
    }
  }, [searchTerm]);

  const getMemberDetailTemplate = (uid, name, url, isTeamLead) => {
    return (
      <>
        <div
          className="flex cursor-pointer items-center gap-2 hover:bg-slate-100"
          key={'contributor' + uid}
          onClick={() => {
            window.open('/members/' + uid);
            // router.push('/members/' + uid);
          }}
        >
          <div className='relative'>
            {url && (
              <Image
                src={url}
                alt="member image"
                width={40}
                height={40}
                className="shrink-0 rounded-full border border-[#E2E8F0]"
              />
            )}
            {!url && (
              <UserIcon className="h-[40px] w-[40px] shrink-0 rounded-full bg-slate-100 fill-slate-200" />
            )}
            {isTeamLead && (
                  <div className="absolute top-[-3px] right-[-7px]">
                    <Image
                      src="/assets/images/icons/projects/team-lead.svg"
                      alt="team lead image"
                      width={16}
                      height={16}
                    />
                  </div>
                )}
          </div>
          <div className="text-base font-normal not-italic leading-5 text-black">
            {name}
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="fixed relative inset-0 left-0 top-0 z-[1000] grow overflow-x-hidden outline-none"
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
            {/* <div className="flex min-h-full items-center justify-center p-4"> */}
            <div className="flex mt-20 items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="slim-scroll relative h-[416px] w-[500px] max-w-2xl transform rounded-md bg-white py-8 pl-8 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="div"
                    className="pb-3 text-base font-semibold not-italic leading-[22px]"
                  >
                    <div className="">
                      <div className="flex flex-col gap-2">
                        <p className="">
                          {' '}
                          {contriTitle} (
                          {contributorsList.length +
                            contributingMembers?.length}
                          )
                        </p>
                        <div className="w-full pr-5">
                          <InputField
                            label="Search"
                            name="searchBy"
                            showLabel={false}
                            icon={SearchIcon}
                            placeholder={'Search'}
                            className="rounded-[8px] border"
                            value={searchTerm}
                            onKeyUp={(event) => {
                              // if (
                              //   event.key === 'Enter' ||
                              //   event.keyCode === 13
                              // ) {
                                setSearchTerm(event.currentTarget.value);
                              // }
                            }}
                            hasClear
                            onClear={() => setSearchTerm('')}
                          />
                        </div>
                      </div>
                    </div>
                  </Dialog.Title>
                  <div className="h-[72%] overflow-y-scroll flex flex-col gap-2">
                    {filteredContriList &&
                      filteredContriList.map((contri, index) => {
                        return getMemberDetailTemplate(
                          contri?.uid,
                          contri?.name,
                          contri?.logo,
                          contri?.teamLead
                        );
                      })}
                    {filteredContriMembers &&
                      filteredContriMembers.map((contri) => {
                        const teamLeadArr = contri.teamMemberRoles?.filter(
                          (teamRoles) => {
                            return teamRoles?.teamLead === true;
                          }
                        );
                        return getMemberDetailTemplate(
                          contri.uid,
                          contri.name,
                          contri.image?.url,
                          teamLeadArr?.length > 0
                        );
                      })}
                      {
                        filteredContriList.length === 0 && filteredContriMembers.length === 0 && <>
                       No results found for the search criteria.</>
                      }
                  </div>
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
