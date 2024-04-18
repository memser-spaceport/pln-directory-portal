import { CheckIcon, XIcon } from '@heroicons/react/outline';
import api from '../../utils/api';
import router from 'next/router';
import APP_CONSTANTS, {
  API_ROUTE,
  ROUTE_CONSTANTS,
} from '../../utils/constants';
import { toast } from 'react-toastify';

export function FooterButtons(props) {
  const saveButtonClassName = props.disableSave
    ? 'shadow-special-button-default inline-flex w-full justify-center rounded-full bg-slate-400 px-6 py-2 text-base font-semibold leading-6 text-white outline-none'
    : 'on-focus leading-3.5 text-md mb-2 mr-2 flex items-center rounded-full border border-blue-600 bg-blue-600 px-4 py-3 text-left font-medium text-white last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full';
  async function handleAprroveOrReject(
    id,
    type,
    referenceUid,
    isApproved,
    setLoader
  ) {
    const data = {
      status: isApproved
        ? APP_CONSTANTS.APPROVED_FLAG
        : APP_CONSTANTS.REJECTED_FLAG,
      participantType: type,
      ...(referenceUid && { referenceUid: referenceUid }),
    };
    const configuration = {
      headers: {
        authorization: `Bearer ${props.token}`,
      },
    };
    setLoader(true);
    await api
      .patch(`${API_ROUTE.PARTICIPANTS_REQUEST}/${id}`, data, configuration)
      .then((res) => {
        if (res?.data?.code == 1) {
          const message = `${
            isApproved
              ? APP_CONSTANTS.APPROVED_LABEL
              : APP_CONSTANTS.REJECTED_LABEL
          } successfully`;
          toast(message);
        } else {
          toast(res?.data?.message);
        }
        router.push({
          pathname: ROUTE_CONSTANTS.PENDING_LIST,
        });
      })
      .catch((e) => {
        if (e.response.status === 500) {
          router.push({
            pathname: ROUTE_CONSTANTS.INTERNAL_SERVER_ERROR,
          });
        } else if (e.response.status === 400) {
          toast(e?.response?.data?.message);
        } else {
          toast(e?.message);
        }
      })
      .finally(() => setLoader(false));
  }

  return (
    <div className="header">
      <nav className="navbar fixed bottom-0 z-[1157] grid h-[80px] w-full grid-flow-col items-center bg-[white] px-12 only-of-type:shadow-[0_1px_4px_0_#e2e8f0]">
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
              className={saveButtonClassName}
              disabled={props.disableSave}
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
                className={`on-focus leading-3.5 text-md mb-2 mr-2 flex items-center rounded-full border border-slate-300 px-4 py-2 text-left font-medium text-white last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full ${
                  props.isEditEnabled && 'bg-slate-400'
                } ${!props.isEditEnabled && ' bg-[#D65229]'}`}
                disabled={props.isEditEnabled}
                onClick={() =>
                  handleAprroveOrReject(
                    props?.id,
                    props?.type,
                    props?.referenceUid,
                    false,
                    props?.setLoader
                  )
                }
              >
                <XIcon className="stroke-3 h-6 w-6 pr-1" />
                <span>Reject</span>
              </button>
            </div>
            <div>
              <button
                className={`on-focus leading-3.5 text-md mb-2 mr-2 flex items-center rounded-full border border-slate-300  px-5 py-2 text-left font-medium text-white last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full ${
                  props.isEditEnabled && 'bg-slate-400'
                } ${!props.isEditEnabled && 'bg-[#0F9F5A]'}`}
                disabled={props.isEditEnabled}
                onClick={() =>
                  handleAprroveOrReject(
                    props?.id,
                    props?.type,
                    props?.referenceUid,
                    true,
                    props?.setLoader
                  )
                }
              >
                <CheckIcon className="stroke-3 h-6 w-6 pr-1" />
                <span>Approve</span>
              </button>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
}
