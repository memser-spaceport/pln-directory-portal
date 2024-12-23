import { CheckIcon, XIcon } from '@heroicons/react/outline';
import api from '../../utils/api';
import router from 'next/router';
import Modal from '../modal/modal';
import APP_CONSTANTS, {
  API_ROUTE,
  ENROLLMENT_TYPE,
  ROUTE_CONSTANTS,
} from '../../utils/constants';
import { toast } from 'react-toastify';
import { useState } from 'react';

export function FooterButtons(props) {
  const [openModal, setOpenModal] = useState(false);
  const teamRoute = router.pathname === "/team-view";
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
      if (props.from === "approved") {
        await api.post(`${API_ROUTE.ADMIN_APPROVAL}`, { memberIds: [props.id] }, configuration);
        message = `Successfully ${APP_CONSTANTS.VERIFIED_FLAG}`;
      } else {
        await api.patch(`${API_ROUTE.PARTICIPANTS_REQUEST}/${id}`, data, configuration)
        message = status === "REJECTED"
          ? `Successfully ${APP_CONSTANTS.REJECTED_LABEL}`
          : `Successfully ${isVerified ? (teamRoute ? APP_CONSTANTS.APPROVED_LABEL : APP_CONSTANTS.VERIFIED_FLAG ): APP_CONSTANTS.UNVERIFIED_FLAG}`;
      }
      setOpenModal(false)
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
      setOpenModal(false)
      setLoader(false);
    }
  }

  const handleOpen = () => {
    setOpenModal(true);
  }

  const onClose = () => {
    setOpenModal(false);
  }

  return (
    <div className="header">
      {openModal &&
        <Modal
          isOpen={true}
          onClose={onClose}
        >
          <div className="relative min-h-[21vh] w-[640px] rounded-[8px] bg-white text-[#000000]">
            <div className='absolute top-[10px] right-[10px]'>
              <button onClick={onClose}>
                <img
                  alt="close"
                  src="/assets/images/close_gray.svg"
                  height={20}
                  width={20}
                />
              </button>
            </div>
            <div className='p-[30px] flex flex-col justify-between '>
              <div className='text-2xl font-extrabold leading-8 text-left py-[10px]'>
                Are you sure you want to reject?
              </div>
              <div className='text-sm font-normal leading-5 text-left'>
                Clicking reject will remove the {teamRoute ? "team" : "member" } from the list.
              </div>

              <div className="flex gap-[8px] mt-[25px] justify-end">
                <button
                  onClick={() => setOpenModal(false)}
                  className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[18px] py-[10px] text-[13px] font-[400]`}
                >
                  Cancel
                </button>

              <button
                className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[18px] py-[10px] text-[13px] font-[400] text-white bg-[#DD2C5A]`}
                onClick={() => approvelClickHandler(props?.id, "REJECTED", false, props?.setLoader)}
              >
                Reject
              </button>
            </div>
            </div>
          </div>
        </Modal>
      }
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
            {props.from !== "approved" && !teamRoute &&
              <button
                onClick={() => approvelClickHandler(props?.id, "APPROVED", false, props?.setLoader)}
                disabled={props.isEditEnabled}
                className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400] ${props.isEditEnabled && 'bg-slate-400 text-[#FFFFFF]'}`}
              >
                {!props.isEditEnabled ?
                  <img height={20} width={20} src="assets/images/unverified.svg" alt="verified" /> :
                  <img height={20} width={20} src="/assets/icons/upgrade-rounded.svg" alt="verified" />}
                Unverify
              </button>
            }

            <button
              className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400]  ${props.isEditEnabled && 'bg-slate-400 text-[#FFFFFF]'}`}
              disabled={props.isEditEnabled}
              onClick={() => approvelClickHandler(props?.id, "APPROVED", true, props?.setLoader)}
            >
              {
                teamRoute ? (
                  props.isEditEnabled ? (
                    <img height={16} width={16} src="assets/images/right_white.svg" alt="verified" />
                  ) : (
                    <img height={20} width={20} src="assets/icons/tick_green.svg" alt="verified" />
                  )
                ) : (
                  props.isEditEnabled ? (
                    <img height={20} width={20} src="/assets/icons/upgrade-rounded.svg" alt="verified" />
                  ) : (
                    <img height={20} width={20} src="assets/images/verified.svg" alt="verified" />
                  )
                )
              }
              {teamRoute ? 'Approve' : 'Verify' }
            </button>

            {props.from !== "approved" &&
              <button
                onClick={() => handleOpen()}
                disabled={props.isEditEnabled}
                className={`flex items-center gap-[4px] rounded-[8px] border border-[#CBD5E1] px-[8px] py-[4px] text-[13px] font-[400] ${props.isEditEnabled && 'bg-slate-400 text-[#FFFFFF]'}`}
              >
                {!props.isEditEnabled ?
                  <img height={20} width={20} src="/assets/images/delete.svg" alt="verified" />
                  :
                  <img height={16} width={16} src="assets/icons/TrashIcon.svg" alt="delete" />}
                Reject
              </button>
            }
          </div>
        </div>
      </nav>
    </div>
  );
}
