import { useState, Fragment } from 'react';
import { Transition, Dialog } from '@headlessui/react';
import { InputField } from '../../../libs/ui/src/lib/input-field/input-field';

interface EmailConfirmationModalProps {
  isOpen: boolean;
  onClose: (confirmed: boolean, subject?: string, email?: string) => void;
  approvedMembers: { name: string; uid: string }[];
  defaultSubject: string;
  targetMemberEmail: string;
}

export function EmailConfirmationModal({
  isOpen,
  onClose,
  approvedMembers,
  defaultSubject,
  targetMemberEmail,
}: EmailConfirmationModalProps) {
  const [subject, setSubject] = useState(defaultSubject);
  const [email, setEmail] = useState(targetMemberEmail);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="fixed inset-0 z-[1058] overflow-y-auto" onClose={() => onClose(false)}>
        <div className="min-h-screen px-4 text-center">
          {isOpen && (
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />
            </Transition.Child>
          )}

          <span className="inline-block h-screen align-middle" aria-hidden="true">
            &#8203;
          </span>

          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <div className="inline-block w-full max-w-2xl transform overflow-hidden rounded-lg bg-white p-6 text-left align-middle shadow-xl transition-all">
              <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                Confirm Email Details
              </Dialog.Title>

              <div className="mt-4">
                <div className="mb-4">
                  <InputField
                    label="Recipient Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="mb-4">
                  <InputField
                    label="Email Subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                  />
                </div>

                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700">Reccomendations to be sent:</h4>
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-gray-200 p-2">
                    {approvedMembers.map((member) => (
                      <div key={member.uid} className="py-1 text-sm text-gray-600">
                        {member.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  onClick={() => onClose(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  onClick={() => onClose(true, subject, email)}
                >
                  Send Email
                </button>
              </div>
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
