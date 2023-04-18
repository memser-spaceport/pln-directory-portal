import { CheckIcon, XIcon } from '@heroicons/react/outline';
import api from '../../utils/api';
import router from 'next/router';
import { ROUTE_CONSTANTS } from '../../utils/constants';

async function handleAprroveOrReject(id, type, referenceUid, isApproved) {
  const data = {
    status: isApproved ? 'APPROVED' : 'REJECTED',
    participantType: type,
    ...(referenceUid ?? { referenceUid: referenceUid }),
  };
  await api
    .patch(`/v1/participants-request/${id}`, data)
    .then((res) => {
      router.push({
        pathname: ROUTE_CONSTANTS.PENDING_LIST,
      });
    })
    .catch((e) => console.error(e));
}

export function FooterButtons(props) {
  return (
    <div className="header">
      <nav className="navbar absolute bottom-0 grid h-[8%] w-full grid-flow-col items-center px-12 only-of-type:shadow-[0_1px_4px_0_#e2e8f0]">
        <div className="col-span-4 justify-self-end">
          {!props.isEditEnabled ? (
            <button
              className="on-focus leading-3.5 text-md mb-2 mr-2 flex items-center rounded-full border border-blue-600 px-5 py-3 text-left font-medium text-blue-600 last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full"
              onClick={() => props.setIsEditEnabled(!props.isEditEnabled)}
            >
              <span>Edit details</span>
            </button>
          ) : (
            <button
              className="on-focus leading-3.5 text-md mb-2 mr-2 flex items-center rounded-full border border-blue-600 bg-blue-600 px-5 py-3 text-left font-medium text-white last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full"
              onClick={props.saveChanges}
            >
              <span>Save Changes</span>
            </button>
          )}
        </div>
        <div className="col-span-3 justify-self-end">
          <div className="flex items-end space-x-3">
            <div>
              <button
                className={`on-focus leading-3.5 text-md mb-2 mr-2 flex items-center rounded-full border border-slate-300 bg-[#D65229] px-5 py-2 text-left font-medium text-white last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full ${
                  props.isEditEnabled && 'bg-slate-400'
                }`}
                disabled={props.isEditEnabled}
                onClick={() =>
                  handleAprroveOrReject(
                    props?.id,
                    props?.type,
                    props?.referenceUid,
                    false
                  )
                }
              >
                <XIcon className="stroke-3 h-6 w-6 p-1" />
                <span>Reject</span>
              </button>
            </div>
            <div>
              <button
                className={`on-focus leading-3.5 text-md mb-2 mr-2 flex items-center rounded-full border border-slate-300 bg-[#0F9F5A] px-5 py-2 text-left font-medium text-white last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full ${
                  props.isEditEnabled && 'bg-slate-400'
                }`}
                disabled={props.isEditEnabled}
                onClick={() =>
                  handleAprroveOrReject(
                    props?.id,
                    props?.type,
                    props?.referenceUid,
                    true
                  )
                }
              >
                <CheckIcon className="stroke-3 h-6 w-6 p-1" />
                <span>Approve</span>
              </button>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
}
