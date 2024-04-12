import { Dialog } from '@headlessui/react';
import { ReactComponent as CloseIcon } from '/public/assets/images/icons/close-grey.svg';
import { useEffect, useState } from 'react';
import TeamsDropDown from './teams-dropdown';
import {
  createEventGuest,
  editEventGuest,
  getEventDetailBySlug,
} from 'apps/web-app/services/irl.service';
import { toast } from 'react-toastify';
import { LoadingIndicator } from '../shared/loading-indicator/loading-indicator';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';

const AddDetailsPopup = (props: any) => {
  const isOpen = props.isOpen;
  const onClose = props?.onClose;
  const teams = props?.teams;
  const userInfo = props?.userInfo;
  const eventDetails = props?.eventDetails;
  const isUserGoing = props?.isUserGoing;
  const registeredGuest = props?.registeredGuest;
  const router = useRouter();
  const slug = router.query.slug;

  const getAuthToken = (token: string) => {
    try {
      const authToken = JSON.parse(token);
      return authToken;
    } catch {
      return '';
    }
  };

  const userCookie = getAuthToken(Cookies.get('authToken'));
  const [isLoader, setIsLoader] = useState(false);
  const [formValues, setFormValues] = useState({
    teamUid: '',
    telegramId: '',
    reason: '',
  });
  const [formErrors, setFormErrors] = useState<any>({});
  const analytics = useAppAnalytics();
  const user = getUserInfo();
  
  const intialTeamValue = teams.find((team) => team.id === formValues.teamUid);
  const handleChange = (event: any) => {
    const { name, value } = event.target;
    setFormValues((prevFormData) => ({ ...prevFormData, [name]: value }));
  };

  const onTeamsChange = (value) => {
    setFormValues((prevFormData) => ({ ...prevFormData, teamUid: value.id }));
  };

  const getEventDetails = async () => {
    const eventDetails = await getEventDetailBySlug(slug, userCookie);
    document.dispatchEvent(
      new CustomEvent('updateGuests', {
        detail: {
          eventDetails,
        },
      })
    );
  };

  const onEditGuestDetails = async () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_RSVP_POPUP_UPDATE_BTN_CLICKED,
      {
        type: 'clicked',
        user,
      }
    );

    const payload = {
      ...formValues,
      telegramId: removeAt(formValues?.telegramId),
      memberUid: userInfo?.uid,
      eventUid: eventDetails?.id,
      uid: registeredGuest.uid,
    };

    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_RSVP_POPUP_UPDATE_BTN_CLICKED,
      {
        type: 'api_initiated',
        user,
        ...payload,
      }
    );

    const response = await editEventGuest(
      eventDetails?.slugUrl,
      registeredGuest.uid,
      payload
    );

    if (response.status === 200 || response.status === 201) {
      analytics.captureEvent(
        APP_ANALYTICS_EVENTS.IRL_RSVP_POPUP_UPDATE_BTN_CLICKED,
        {
          type: 'api_sucess',
          user,
        }
      );
      await getEventDetails();
      onClose();
      setIsLoader(false);
      toast.success('Your details has been updated successfully');
    }
  };

  const validateForm = (formValues: any) => {
    const errors = {} as any;
    if (!formValues?.teamUid?.trim()) {
      errors.teamUid = 'Team is required';
    }
    setFormErrors(errors);
    return Object.keys(errors)?.length === 0;
  };

  const onAddGuestDetails = async () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_RSVP_POPUP_SAVE_BTN_CLICKED,
      {
        type: 'clicked',
        user,
      }
    );

    const payload = {
      ...formValues,
      telegramId: removeAt(formValues?.telegramId),
      memberUid: userInfo?.uid,
      eventUid: eventDetails?.id,
    };

    const isValid = validateForm(payload);

    if (isValid) {
      analytics.captureEvent(
        APP_ANALYTICS_EVENTS.IRL_RSVP_POPUP_SAVE_BTN_CLICKED,
        {
          type: 'api_initiated',
          user,
          ...payload,
        }
      );

      const response = await createEventGuest(eventDetails?.slugUrl, payload);
      if (response.status === 201) {
        analytics.captureEvent(
          APP_ANALYTICS_EVENTS.IRL_RSVP_POPUP_SAVE_BTN_CLICKED,
          {
            type: 'api_success',
            user,
          }
        );
        await getEventDetails();
        onClose();
        setIsLoader(false);
        toast.success('Your details has been added successfully');
      }
    } else {
      setIsLoader(false);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setIsLoader(true);
    try {
      if (!isUserGoing) {
        await onAddGuestDetails();
      } else {
        await onEditGuestDetails();
      }
    } catch {
      onClose();
      toast.error('Something went wrong');
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault(); // Prevent form submission
    }
  };

  function removeAt(text: string) {
    const textToBeModified = text?.trim();
    const modifiedText = textToBeModified?.replace(/\B@/g, '');
    return modifiedText;
  }

  useEffect(() => {
    if (isUserGoing) {
      const data = {
        teamUid: registeredGuest.teamUid,
        telegramId: registeredGuest.telegramId,
        reason: registeredGuest.reason,
      };
      setFormValues(data);
    }
  }, []);

  return (
    <>
      <div className="relative">
        <Dialog open={isOpen} onClose={onClose} className="relative z-50">
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
            <Dialog.Panel className="mx-auto w-[320px] rounded bg-white lg:w-[640px] ">
              <form onSubmit={onSubmit}>
                <div className="flex flex-col gap-5 px-[20px] py-[24px]">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <h1 className="text-[18px] font-semibold leading-[14px] text-[#0F172A]">
                      RSVP Details
                    </h1>
                    <CloseIcon
                      className="stroke-3 cursor-pointer"
                      onClick={onClose}
                    />
                  </div>
                  {/* BODY */}
                  <div className="flex w-full flex-col gap-5">
                    <div className="flex flex-col gap-[10px] lg:flex-row lg:gap-[30px]">
                      <div className="flex flex-1 flex-col gap-3">
                        <h6 className="text-sm font-semibold text-[#0F172A]">
                          Team
                        </h6>
                        <div className="w-full lg:w-[285px]">
                          <input
                            name="teamUid"
                            value={formValues.teamUid}
                            onChange={handleChange}
                            placeholder="Team"
                            className="hidden w-full rounded-lg border border-[#CBD5E1] py-[8px] px-[12px] text-[#475569] focus:outline-none "
                          />
                          <TeamsDropDown
                            options={teams}
                            placeholder="Select Team"
                            getValue={onTeamsChange}
                            initialOption={intialTeamValue}
                          />
                          <span className="text-[13px] leading-[18px] text-red-500">
                            {formErrors?.teamUid}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-1  flex-col gap-3">
                        <h6 className="text-sm font-semibold text-[#0F172A]">
                          Telegram Handle
                        </h6>
                        <div className="relative">
                          <input
                            value={formValues?.telegramId}
                            onChange={handleChange}
                            name="telegramId"
                            placeholder="Enter link here"
                            className="h-10 w-full rounded-lg border border-[#CBD5E1] py-[8px] pl-6 pr-[12px] text-[#475569] placeholder:text-sm placeholder:leading-6 placeholder:text-[#475569] placeholder:opacity-40 focus:outline-none"
                            onKeyDown={handleKeyDown}
                          />
                          <span className="absolute left-2  top-[19px] -translate-y-1/2 transform text-[#475569] ">
                            @
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <h6 className="text-sm font-semibold text-[#0F172A]">
                        What are you hoping to get out of this event?
                      </h6>
                      <textarea
                        maxLength={100}
                        value={formValues?.reason}
                        onChange={handleChange}
                        name="reason"
                        placeholder="Enter details here"
                        className="placeholder:text-[500] h-[80px] w-full resize-none rounded-lg border border-[#CBD5E1] px-2 py-3 text-sm font-[500] leading-6 text-[#475569] placeholder:text-sm placeholder:leading-6 placeholder:text-[#475569] placeholder:opacity-40 focus:outline-none"
                      />
                      {/* {formValues?.reason?.length >= 100 ? (
                        <span className="text-[13px] leading-[18px] text-red-500">
                          Character limit reached
                        </span>
                      ) : ( */}
                        <span className="text-[13px] leading-[18px] text-[#0F172A]">
                          {100 - formValues?.reason?.length} characters
                          remaining
                        </span>
                      {/* )} */}
                    </div>
                  </div>
                  {/* FOOTER */}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={onClose}
                      className="flex h-10 items-center justify-center rounded-[60px] border border-[#CBD5E1] px-[24px] text-sm font-[500] text-[#0F172A] shadow-sm"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      className="flex h-10 items-center justify-center rounded-[60px] bg-gradient-to-r from-blue-500 to-teal-400 px-[24px] text-sm font-[500] text-[#fff] shadow-sm"
                    >
                      {isUserGoing ? 'Update' : 'Save'}
                    </button>
                  </div>
                </div>
              </form>
              {isLoader && (
                <div className="fixed top-0 left-0 bottom-0 right-0 z-[100] flex h-[100%] w-full items-center justify-center bg-black/30 bg-black/30 bg-[#ffffffb3]">
                  <LoadingIndicator />
                </div>
              )}
            </Dialog.Panel>
          </div>
        </Dialog>
      </div>
    </>
  );
};

export default AddDetailsPopup;
