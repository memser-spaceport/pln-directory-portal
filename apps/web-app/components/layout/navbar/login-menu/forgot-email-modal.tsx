import { Dialog, Transition } from '@headlessui/react';
import {
  XCircleIcon,
  InformationCircleIcon,
  UserIcon,
} from '@heroicons/react/solid';
import { useRouter } from 'next/router';
import { InputField } from '@protocol-labs-network/ui';
import {
  ChangeEvent,
  Dispatch,
  Fragment,
  SetStateAction,
  useState,
} from 'react';
import { IMember } from '../../../../utils/members.types';
import { parseMember } from '../../../../utils/members.utils';
import { fetchMembers } from '../../../../utils/services/members';
import { authenticate } from '../../../../utils/services/auth';

interface IForgotEmailModal {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
}

export function ForgotEmailModal({
  isOpen,
  setIsModalOpen,
}: IForgotEmailModal) {
  const [name, setName] = useState('');
  const [members, setMembers] = useState([]);
  const router = useRouter();
  const onNameChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setName(event.target.value);
  };

  const onSearch = async () => {
    if (name === '') {
      setMembers([]);
    } else {
      const membersResp = await fetchMembers({ searchBy: name });
      const members: IMember[] = membersResp
        ? membersResp.map((member) => parseMember(member))
        : [];
      setMembers(members);
    }
  };

  const handleOnClick = () => {
    setTimeout(() => {
      setMembers([]);
      setName('');
    }, 1000);
    setIsModalOpen(false);
  };

  const handleSignIn = () => {
    router.push(`${window.location.pathname}${window.location.search}#login`)
    handleOnClick();
  };

  return (
    <>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="fixed relative inset-0 left-0 top-0 z-[1055] w-full grow overflow-x-hidden outline-none"
          onClose={() => setIsModalOpen(false)}
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
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="relative w-full max-w-2xl transform rounded-md bg-white p-8 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h2" className="flex justify-between">
                    <p className="text-2xl font-bold leading-10">
                      {' '}
                      Enter details to find your email{' '}
                    </p>
                    <button
                      type="button"
                      className={`inline-flex justify-center rounded-full py-2 ${
                        members.length > 0
                          ? 'shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]'
                          : 'text-base font-semibold leading-6 text-[#156FF7]'
                      }`}
                      onClick={handleSignIn}
                    >
                      Continue to Sign In
                    </button>
                  </Dialog.Title>
                  <div className="mt-3">
                    <InputField
                      name="name"
                      label="Name"
                      pattern="^[a-zA-Z\s]*$"
                      maxLength={64}
                      value={name}
                      onChange={onNameChange}
                      placeholder="Enter your full name"
                      className="custom-grey mt-2 border border-gray-300"
                      onKeyUp={(event) => {
                        if (event.key === 'Enter' || event.keyCode === 13) {
                          onSearch();
                        }
                      }}
                    />
                  </div>
                  <div className="w-100 mt-6 flex justify-end">
                    <button
                      type="button"
                      onClick={onSearch}
                      className={`shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus ml-3 inline-flex w-1/4 justify-center rounded-full px-6 py-2 text-base font-semibold leading-6 ${
                        members.length > 0
                          ? 'text-[#156FF7] outline outline-1 outline-[#156FF7] hover:outline-2'
                          : 'bg-gradient-to-r from-[#427DFF] to-[#44D5BB] text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]'
                      }`}
                    >
                      Search
                    </button>
                  </div>
                  {members.length > 0 && (
                    <>
                      <hr className="mt-8 mb-3 h-px border border-solid bg-gray-300 dark:bg-gray-700"></hr>
                      <div className="flex text-sm text-[#94A3B8]">
                        <InformationCircleIcon
                          data-testid={`info-icon`}
                          className={`h-5 w-5 text-slate-400`}
                        />
                        <p className="ml-1">
                          {' '}
                          If you find your email listed below, please{' '}
                          <span className={'font-bold text-[#156FF7]'}>
                            {' '}
                            login{' '}
                          </span>{' '}
                          using the same.
                        </p>
                      </div>
                      <div className="mt-3 max-h-72 min-h-max w-full overflow-y-auto bg-[#F1F5F9] p-2">
                        {members.map((member) => {
                          return (
                            <div
                              key={member.id}
                              className="mt-1 flex h-12 w-full justify-between rounded-md bg-white p-1"
                            >
                              {member.image ? (
                                <img
                                  src={member.image}
                                  alt=""
                                  className="ml-2 h-full w-10 rounded-full"
                                />
                              ) : (
                                <UserIcon className="mt-2 h-10 w-10 fill-white" />
                              )}
                              <p className="m-auto ml-2 text-sm font-semibold text-[#64748B]">
                                {' '}
                                {member.email}{' '}
                              </p>
                              <a
                                target="_blank"
                                rel="noopener noreferrer"
                                href={`/members/${member.id}`}
                                className="m-auto mr-4 text-sm font-semibold text-[#156FF7]"
                                onClick={handleOnClick}
                              >
                                Visit Profile
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-white" />
                  <XCircleIcon
                    onClick={handleOnClick}
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
