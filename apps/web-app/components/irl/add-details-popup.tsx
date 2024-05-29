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
import { getUserInfo, parseCookie } from 'apps/web-app/utils/shared.utils';
import { APP_ANALYTICS_EVENTS, IRL_LW_EE_DATES } from 'apps/web-app/constants';
import TagsPicker from './tags-picker';
import useTagsPicker from 'apps/web-app/hooks/shared/use-tags-picker';

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

  const userCookie = parseCookie(Cookies.get('authToken'));
  const [isLoader, setIsLoader] = useState(false);
  const [formErrors, setFormErrors] = useState<any>({});
  const [formValues, setFormValues] = useState({
    teamUid: '',
    telegramId: '',
    reason: '',
    topics: [],
    additionalInfo: {
      checkInDate: '',
      checkOutDate: '',
    },
  });
  const analytics = useAppAnalytics();
  const user = getUserInfo();

  const defaultItems = process.env.IRL_DEFAULT_TOPICS?.split(',') ?? [];
  const topicsProps = useTagsPicker({
    defaultItems,
    selectedItems: formValues?.topics,
  });

  const intialTeamValue = teams?.find((team) => team?.id === formValues?.teamUid);
  const handleChange = (event: any) => {
    const { name, value } = event.target;
    setFormValues((prevFormData) => ({ ...prevFormData, [name]: value }));
  };

  const onTeamsChange = (value) => {
    setFormValues((prevFormData) => ({ ...prevFormData, teamUid: value?.id }));
  };

  //get event details
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

  //edit guest details
  const onEditGuestDetails = async () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_RSVP_POPUP_UPDATE_BTN_CLICKED,
      {
        type: 'clicked',
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        user,
      }
    );

    const payload = {
      ...formValues,
      topics: topicsProps?.selectedItems,
      telegramId: removeAt(formValues?.telegramId),
      memberUid: userInfo?.uid,
      eventUid: eventDetails?.id,
      uid: registeredGuest.uid,
    };

    const team = teams?.find((team) => team.id === payload?.teamUid);
    const teamName = team?.name;
    const isValid = validateForm(payload);

    if (isValid) {
      analytics.captureEvent(
        APP_ANALYTICS_EVENTS.IRL_RSVP_POPUP_UPDATE_BTN_CLICKED,
        {
          type: 'api_initiated',
          eventId: eventDetails?.id,
          eventName: eventDetails?.name,
          user,
          ...payload,
          teamName,
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
            type: 'api_success',
            eventId: eventDetails?.id,
            eventName: eventDetails?.name,
            user,
            ...payload,
            teamName,
          }
        );
        await getEventDetails();
        onClose();
        setIsLoader(false);
        toast.success('Your details has been updated successfully');
      }
    } else {
      setIsLoader(false);
    }
  };

  //validate form
  const validateForm = (formValues: any) => {
    const errors = {} as any;
    if (!formValues?.teamUid?.trim()) {
      errors.teamUid = 'Team is required';
    }

    if (eventDetails?.isExclusionEvent) {
      if (!formValues.additionalInfo.checkInDate) {
        errors.checkInDate = 'Check in date is required';
      }
      if (!formValues.additionalInfo.checkOutDate) {
        errors.checkOutDate = 'Check out date is required';
      }
    }
    setFormErrors(errors);
    return Object.keys(errors)?.length === 0;
  };

  //add event details
  const onAddGuestDetails = async () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_RSVP_POPUP_SAVE_BTN_CLICKED,
      {
        type: 'clicked',
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        user,
      }
    );

    const payload = {
      ...formValues,
      topics: topicsProps?.selectedItems,
      telegramId: removeAt(formValues?.telegramId),
      memberUid: userInfo?.uid,
      eventUid: eventDetails?.id,
    };

    const team = teams?.find((team) => team.id === payload?.teamUid);
    const teamName = team?.name;
    const isValid = validateForm(payload);

    if (isValid) {
      analytics.captureEvent(
        APP_ANALYTICS_EVENTS.IRL_RSVP_POPUP_SAVE_BTN_CLICKED,
        {
          type: 'api_initiated',
          eventId: eventDetails?.id,
          eventName: eventDetails?.name,
          user,
          ...payload,
          teamName,
        }
      );

      const response = await createEventGuest(eventDetails?.slugUrl, payload);
      if (response.status === 201) {
        analytics.captureEvent(
          APP_ANALYTICS_EVENTS.IRL_RSVP_POPUP_SAVE_BTN_CLICKED,
          {
            type: 'api_success',
            eventId: eventDetails?.id,
            eventName: eventDetails?.name,
            user,
            ...payload,
            teamName,
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

  //form submit
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

  //prevent form submit from when user pressing enter in the empty input field
  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault(); // Prevent form submission
    }
  };

  //remove the @ symbol from telegram
  function removeAt(text: string) {
    const textToBeModified = text?.trim();
    const modifiedText = textToBeModified?.replace(/\B@/g, '');
    return modifiedText;
  }

  //get additionalinfo from form
  const onAdditionalInfoChange = (event: any) => {
    const { name, value } = event.target;
    setFormValues((prevFormData) => ({
      ...prevFormData,
      additionalInfo: { ...prevFormData?.additionalInfo, [name]: value },
    }));
  };

  useEffect(() => {
    if (isUserGoing) {
      const data = {
        teamUid: registeredGuest.teamUid,
        telegramId: registeredGuest.telegramId,
        reason: registeredGuest.reason ? registeredGuest?.reason?.trim() : '',
        topics: registeredGuest?.topics,
        additionalInfo: {
          ...formValues.additionalInfo,
          checkInDate: registeredGuest?.additionalInfo?.checkInDate,
          checkOutDate: registeredGuest?.additionalInfo?.checkOutDate,
        },
      };
      setFormValues(data);
    } else {
      const teamUid = teams?.find((team) => team?.mainTeam)?.id;
      setFormValues((prev) => ({ ...prev, teamUid }));
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
                <div className="flex max-h-[80vh] flex-col gap-5 py-[24px] pl-[20px] pr-[10px]">
                  {/* Header */}
                  <div className="flex items-center justify-between pr-[10px]">
                    <h1 className="text-[18px] font-semibold leading-[14px] text-[#0F172A]">
                      Attendee Details
                    </h1>
                    <CloseIcon
                      className="stroke-3 cursor-pointer"
                      onClick={onClose}
                    />
                  </div>
                  {/* BODY */}
                  <div className="flex w-full flex-1 flex-col gap-5 overflow-auto pr-[10px]">
                    <div className="flex flex-col gap-[10px] lg:flex-row lg:gap-[30px]">
                      <div className="flex flex-1 flex-col gap-3">
                        <h6 className="text-sm font-semibold text-[#0F172A]">
                          Team
                        </h6>
                        <div className="w-full lg:w-[285px]">
                          <input
                            name="teamUid"
                            value={formValues?.teamUid}
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
                      Choose the topics that interest you
                      </h6>
                      <TagsPicker
                        inputValue={topicsProps?.inputValue}
                        defaultItems={topicsProps?.defaultItems}
                        selectedItems={topicsProps?.selectedItems}
                        onItemsSelected={topicsProps?.onItemsSelected}
                        onInputChange={topicsProps?.onInputChange}
                        onInputKeyDown={topicsProps?.onInputKeyDown}
                        error={topicsProps?.error}
                        placeholder="Something else? Add here"
                      />
                      <select
                        multiple
                        name="topics"
                        value={formValues.topics}
                        onChange={handleChange}
                        className="hidden"
                      >
                      </select>
                    </div>
                    <div className="flex flex-col gap-3">
                      <h6 className="text-sm font-semibold text-[#0F172A]">
                        Briefly describe the topics you are interested in
                      </h6>
                      <textarea
                        maxLength={250}
                        value={formValues?.reason}
                        onChange={handleChange}
                        name="reason"
                        placeholder="Enter details here"
                        className="placeholder:text-[500] h-[80px] w-full resize-none rounded-lg border border-[#CBD5E1] px-2 py-3 text-sm font-[500] leading-6 text-[#475569] placeholder:text-sm placeholder:leading-6 placeholder:text-[#475569] placeholder:opacity-40 focus:outline-none"
                      />
                      <span className="text-[13px] leading-[18px] text-[#0F172A]">
                        {250 - formValues?.reason?.length} characters remaining
                      </span>
                    </div>
                    {eventDetails?.isExclusionEvent && (
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-3 lg:flex-row">
                          <div className="flex flex-col gap-1 lg:flex-1">
                            <div className="flex flex-col gap-3 ">
                              <h6 className="text-sm font-bold text-[#0F172A]">
                              Arrival Date*
                              </h6>
                              <input
                                type="date"
                                name="checkInDate"
                                autoComplete="off"
                                className="h-10 w-full rounded-lg border border-[#CBD5E1] px-3 py-[8px] text-sm leading-6 text-[#475569] focus:outline-none"
                                min={IRL_LW_EE_DATES.startDate}
                                onChange={onAdditionalInfoChange}
                                max={IRL_LW_EE_DATES.endDate}
                                value={formValues?.additionalInfo?.checkInDate}
                              />
                            </div>
                            <span className="text-[13px] leading-[18px] text-red-500">
                              {formErrors?.checkInDate}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1 lg:flex-1">
                            <div className="flex flex-col gap-3 ">
                              <h6 className="text-sm font-bold text-[#0F172A]">
                              Departure Date*
                              </h6>
                              <input
                                type="date"
                                name="checkOutDate"
                                autoComplete="off"
                                className="h-10 w-full rounded-lg border border-[#CBD5E1] px-3 py-[8px] text-sm leading-6 text-[#475569] focus:outline-none"
                                min={formValues?.additionalInfo?.checkInDate}
                                max={IRL_LW_EE_DATES.endDate}
                                value={formValues?.additionalInfo?.checkOutDate}
                                onChange={onAdditionalInfoChange}
                                disabled={
                                  !formValues?.additionalInfo?.checkInDate
                                }
                              />
                            </div>
                            <span className="text-[13px] leading-[18px] text-red-500">
                              {formErrors?.checkOutDate}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-[6px]">
                          <img
                            src="/assets/images/icons/info_icon.svg"
                            alt="info"
                            width={16}
                            height={16}
                          />
                          <p className="text-[13px] font-[500] leading-[18px] text-[#0F172A] opacity-40">
                          Please note that your arrival and departure dates must fall within five days before or after the official event dates (June 2nd - June 30th).
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* FOOTER */}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={onClose}
                      className="flex h-10 items-center justify-center rounded-lg border border-[#CBD5E1] px-[24px] text-sm font-[500] text-[#0F172A] shadow-sm"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      className="flex h-10 items-center justify-center rounded-lg border border-[#CBD5E1] bg-[#156FF7] px-[24px] text-sm font-[500] text-[#fff] shadow-sm hover:bg-[#1D4ED8]"
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
      <style jsx>
        {`
          ::-webkit-scrollbar {
            width: 6px;
            background: #f7f7f7;
          }
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          ::-webkit-scrollbar-thumb {
            background-color: #cbd5e1;
            border-radius: 10px;
          }
        `}
      </style>
    </>
  );
};

export default AddDetailsPopup;
