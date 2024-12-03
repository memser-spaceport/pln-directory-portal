import { CheckIcon, XIcon } from '@heroicons/react/outline';
import api from '../../utils/api';
import router from 'next/router';
import APP_CONSTANTS, {
  API_ROUTE,
  ENROLLMENT_TYPE,
  ROUTE_CONSTANTS,
} from '../../utils/constants';
import { toast } from 'react-toastify';

export function FooterButtons(props) {
  const saveButtonClassName = props.disableSave
    ? 'shadow-special-button-default inline-flex w-full justify-center rounded-full bg-slate-400 px-6 py-2 text-base font-semibold leading-6 text-white outline-none'
    : 'on-focus leading-3.5 text-md mb-2 mr-2 flex items-center rounded-full border border-blue-600 bg-blue-600 px-4 py-3 text-left font-medium text-white last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full';
  async function approvelClickHandler(id: any, status: any, isVerified: any, setLoader) {
    const data = {
      status: status,
      participantType: ENROLLMENT_TYPE.MEMBER,
      isVerified,
      uid: id,
    };
    const configuration = {
      headers: {
        authorization: `Bearer ${props.token}`,
      },
    };
    setLoader(true);
    try {
      let message = "";
      setLoader(true);
      await api.patch(`${API_ROUTE.PARTICIPANTS_REQUEST}/${id}`, data, configuration)
      message = status === "REJECTED"
        ? `Successfully ${APP_CONSTANTS.REJECTED_LABEL}`
        : `Successfully ${isVerified ? APP_CONSTANTS.VERIFIED_FLAG : APP_CONSTANTS.UNVERIFIED_FLAG}`;

      toast(message);
      router.push({
        pathname: ROUTE_CONSTANTS.PENDING_LIST,
      });
    } catch (error: any) {
      if (error.response?.status === 500) {
        router.push({
          pathname: ROUTE_CONSTANTS.INTERNAL_SERVER_ERROR,
        });
      } else if (error.response?.status === 400) {
        toast(error.response?.data?.message || 'Bad request');
      } else {
        toast(error.message || 'An unexpected error occurred');
      }
    } finally {
      setLoader(false);
    }
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
            <button
              className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400]  ${props.isEditEnabled && 'bg-slate-400 text-[#FFFFFF]'}`}
              disabled={props.isEditEnabled}
              onClick={() => approvelClickHandler(props?.id, "APPROVED", true, props?.setLoader)}
            >
              {!props.isEditEnabled ?
                <img height={20} width={20} src="assets/images/verified.svg" alt="verified" /> :
                <img height={20} width={20} src="/assets/icons/upgrade-rounded.svg" alt="verified" />
              }
              Verified
            </button>

            <button
              onClick={() => approvelClickHandler(props?.id, "APPROVED", false, props?.setLoader)}
              disabled={props.isEditEnabled}
              className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400] ${props.isEditEnabled && 'bg-slate-400 text-[#FFFFFF]'}`}
            >
              {!props.isEditEnabled ?
                <img height={20} width={20} src="assets/images/unverified.svg" alt="verified" /> :
                <img height={20} width={20} src="/assets/icons/upgrade-rounded.svg" alt="verified" />
              }
              Unverified
            </button>

            <button
              onClick={() => approvelClickHandler(props?.id, "REJECTED", false, props?.setLoader)}
              disabled={props.isEditEnabled}
              className={`rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400] ${props.isEditEnabled && 'bg-slate-400 text-[#FFFFFF]'}`}
            >
              {!props.isEditEnabled ?
                <img height={20} width={20} src="/assets/images/delete.svg" alt="verified" />
                :
                <img height={16} width={16} src="assets/icons/TrashIcon.svg" alt="delete" />
              }
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}
