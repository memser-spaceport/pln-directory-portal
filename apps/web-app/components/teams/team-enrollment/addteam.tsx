import {
  Dispatch,
  SetStateAction,
  useState,
  ChangeEvent,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { trackGoal } from 'fathom-client';
import AddTeamStepOne from './addteamstepone';
import AddTeamStepTwo from './addteamsteptwo';
import AddTeamStepThree from './addteamstepthree';
import Modal from '../../layout/navbar/modal/modal';
import FormStepsIndicator from '../../shared/step-indicator/step-indicator';
import {
  fetchMembershipSources,
  fetchFundingStages,
  fetchIndustryTags,
  fetchProtocol,
} from '../../../utils/services/dropdown-service';
import { IFormValues } from '../../../utils/teams.types';
import api from '../../../utils/api';
import {
  APP_ANALYTICS_EVENTS,
  ENROLLMENT_TYPE,
  FATHOM_EVENTS,
  FILTER_API_ROUTES,
} from '../../../constants';
import { ReactComponent as TextImage } from '/public/assets/images/create_team.svg';
import { LoadingIndicator } from '../../shared/loading-indicator/loading-indicator';
import { toast } from 'react-toastify';
import useAppAnalytics from '../../../hooks/shared/use-app-analytics';
import { ModalHeader } from '../../shared/modal-header/modal-header';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';

// import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';

interface AddTeamModalProps {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
}

const teamFormSteps = [
  { number: 1, name: 'BASIC' },
  { number: 2, name: 'PROJECT DETAILS' },
  { number: 3, name: 'SOCIAL' },
];

function validateBasicForm(formValues) {
  const errors = [];
  const emailRE =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (
    !formValues.requestorEmail?.trim() ||
    !formValues.requestorEmail?.trim().match(emailRE)
  ) {
    errors.push('Please add a valid Requestor email');
  }
  if (!formValues.name.trim()) {
    errors.push('Please add Team Name');
  }
  if (!formValues.shortDescription?.trim()) {
    errors.push('Please add a Description');
  }
  if (!formValues.longDescription?.trim()) {
    errors.push('Please add a Long Description');
  }
  return errors;
}

function validateProjectDetailForm(formValues) {
  const errors = [];
  if (!formValues.fundingStage?.value) {
    errors.push('Please add Funding Stage');
  }
  if (!formValues.industryTags.length) {
    errors.push('Please add Industry Tags');
  }
  return errors;
}

function validateSocialForm(formValues) {
  const errors = [];
  if (!formValues.contactMethod.trim()) {
    errors.push('Please add Preferred method of contact');
  }
  if (!formValues.website.trim()) {
    errors.push('Please add website');
  }
  return errors;
}

function validateForm(formValues, formStep) {
  let errors = [];

  switch (formStep) {
    case 1:
      errors = validateBasicForm(formValues);
      return errors;
    case 2:
      errors = validateProjectDetailForm(formValues);
      return errors;
    case 3:
      errors = validateSocialForm(formValues);
      return errors;
  }
}

function handleNextClick(
  formValues,
  formStep,
  setFormStep,
  setErrors,
  nameExists,
  divRef,
  analytics
) {
  const errors = validateForm(formValues, formStep);
  const element1 = divRef.current;
  if (element1) {
    element1.scrollTo({ top: 0, behavior: 'smooth' });
    // element1.scrollTop = 0;
  }
  if (errors?.length > 0 || nameExists) {
    setErrors(errors);
    return false;
  }
  console.log(teamFormSteps[formStep - 1]);
  analytics.captureEvent(APP_ANALYTICS_EVENTS.TEAM_JOIN_NETWORK_FORM_STEPS, {
    name: teamFormSteps[formStep - 1],
  });
  setFormStep(++formStep);
  setErrors(errors);
  return true;
}

function getSubmitOrNextButton(
  formValues,
  formStep,
  setFormStep,
  handleSubmit,
  setErrors,
  isProcessing,
  nameExists,
  disableNext,
  divRef,
  analytics
) {
  const buttonClassName =
    'shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-full justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8] disabled:bg-slate-400';
  const submitOrNextButton =
    formStep === 3 ? (
      <button
        className={buttonClassName}
        disabled={isProcessing}
        onClick={handleSubmit}
      >
        Request to Join
      </button>
    ) : (
      <button
        className={
          disableNext
            ? 'shadow-special-button-default inline-flex w-full justify-center rounded-full bg-slate-400 px-6 py-2 text-base font-semibold leading-6 text-white outline-none'
            : buttonClassName
        }
        disabled={disableNext}
        onClick={() =>
          handleNextClick(
            formValues,
            formStep,
            setFormStep,
            setErrors,
            nameExists,
            divRef,
            analytics
          )
        }
      >
        Next
      </button>
    );
  return submitOrNextButton;
}

function getCancelOrBackButton(
  formStep,
  handleModalClose,
  setFormStep,
  setErrors
) {
  const cancelorBackButton =
    formStep === 1 ? (
      <button
        className="on-focus leading-3.5 text-md mb-2 mr-2 rounded-full border border-slate-300 px-5 py-3 text-left font-medium last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full"
        onClick={() => handleModalClose()}
      >
        Cancel
      </button>
    ) : (
      <button
        className="on-focus leading-3.5 text-md mb-2 mr-2 rounded-full border border-slate-300 px-5 py-3 text-left font-medium last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full"
        onClick={() => {
          setFormStep(--formStep);
          setErrors([]);
        }}
      >
        Back
      </button>
    );
  return cancelorBackButton;
}

export function AddTeamModal({ isOpen, setIsModalOpen }: AddTeamModalProps) {
  const [formStep, setFormStep] = useState<number>(1);
  const [errors, setErrors] = useState([]);
  const [nameExists, setNameExists] = useState<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [saveCompleted, setSaveCompleted] = useState<boolean>(false);
  const [dropDownValues, setDropDownValues] = useState({});
  const [disableNext, setDisableNext] = useState<boolean>(false);
  const [formValues, setFormValues] = useState<IFormValues>({
    name: '',
    logoUid: '',
    logoFile: null,
    shortDescription: '',
    requestorEmail: '',
    longDescription: '',
    technologies: [],
    fundingStage: {},
    membershipSources: [],
    industryTags: [],
    contactMethod: '',
    website: '',
    linkedinHandler: '',
    twitterHandler: '',
    telegramHandler: '',
    blog: '',
    officeHours: '',
    // focusAreas: [],
  });
  const analytics = useAppAnalytics();
  const divRef = useRef<HTMLDivElement>(null);
  // const { executeRecaptcha } = useGoogleReCaptcha();

  const [rawData, setRawData] = useState([]);

  useEffect(() => {
    if (isOpen) {
      Promise.all([
        fetchMembershipSources(),
        fetchFundingStages(),
        fetchIndustryTags(),
        fetchProtocol(),
      ])
        .then((data) =>
          setDropDownValues({
            membershipSources: data[0],
            fundingStages: data[1],
            industryTags: data[2],
            protocol: data[3],
          })
        )
        .catch((err) => {
          toast(err?.message);
          console.log('error', err);
        });
    }
  }, [isOpen]);

  function resetState() {
    setFormStep(1);
    setErrors([]);
    setNameExists(false);
    setDropDownValues({});
    setImageUrl('');
    setDisableNext(false);
    setSaveCompleted(false);
    setIsProcessing(false);
    setFormValues({
      name: '',
      logoUid: '',
      logoFile: null,
      requestorEmail: '',
      shortDescription: '',
      longDescription: '',
      technologies: [],
      fundingStage: {},
      membershipSources: [],
      industryTags: [],
      contactMethod: '',
      website: '',
      linkedinHandler: '',
      twitterHandler: '',
      telegramHandler: '',
      blog: '',
      officeHours: '',
      // focusAreas: [],
    });
  }

  function handleModalClose() {
    if (!isProcessing) {
      // if (
      //   typeof document !== 'undefined' &&
      //   document.getElementsByClassName('grecaptcha-badge').length
      // ) {
      //   document
      //     .getElementsByClassName('grecaptcha-badge')[0]
      //     .classList.remove('width-full');
      // }
      resetState();
      setIsModalOpen(false);
    }
  }

  function formatData() {
    const formattedTags = formValues.industryTags.map((item) => {
      return { uid: item?.value, title: item?.label };
    });
    const formattedMembershipSource = formValues.membershipSources.map(
      (item) => {
        return { uid: item?.value, title: item?.label };
      }
    );
    const formattedtechnologies = formValues.technologies.map((item) => {
      return { uid: item?.value, title: item?.label };
    });

    const formattedFundingStage = {
      uid: formValues.fundingStage?.value,
      title: formValues.fundingStage?.label,
    };

    const formattedValue = {
      ...formValues,
      name: formValues.name?.replace(/ +(?= )/g, '').trim(),
      shortDescription: formValues.shortDescription?.trim(),
      longDescription: formValues.longDescription?.trim(),
      website: formValues.website?.trim(),
      twitterHandler: formValues.twitterHandler?.trim(),
      linkedinHandler: formValues.linkedinHandler?.trim(),
      telegramHandler: formValues.telegramHandler?.trim(),
      blog: formValues.blog?.trim(),
      officeHours: formValues.officeHours?.trim(),
      fundingStage: formattedFundingStage,
      fundingStageUid: formattedFundingStage.uid,
      industryTags: formattedTags,
      membershipSources: formattedMembershipSource,
      technologies: formattedtechnologies,
    };
    delete formattedValue.requestorEmail;
    return formattedValue;
  }

  function onNameBlur(event: ChangeEvent<HTMLInputElement>) {
    const data = {
      uniqueIdentifier: event.target.value?.trim(),
      participantType: ENROLLMENT_TYPE.TEAM,
    };
    api
      .post(`/v1/participants-request/unique-identifier`, data)
      .then((response) => {
        setDisableNext(false);
        response?.data &&
        (response.data?.isUniqueIdentifierExist ||
          response.data?.isRequestPending)
          ? setNameExists(true)
          : setNameExists(false);
      });
  }

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      // if (!executeRecaptcha) {
      //   console.log('Execute recaptcha not yet available');
      //   return;
      // }
      setErrors([]);
      const errors = validateSocialForm(formValues);
      if (errors?.length > 0) {
        const element1 = divRef.current;
        if (element1) {
          element1.scrollTo({ top: 0, behavior: 'smooth' });
          // element1.scrollTop = 0;
        }
        setErrors(errors);
        return false;
      }
      analytics.captureEvent(
        APP_ANALYTICS_EVENTS.TEAM_JOIN_NETWORK_FORM_STEPS,
        {
          itemName: 'SOCIAL',
        }
      );
      const requestorEmail = formValues.requestorEmail?.trim();
      const value = formatData();
      try {
        // const captchaToken = await executeRecaptcha();

        // if (!captchaToken) return;
        let image;
        setIsProcessing(true);
        if (value.logoFile) {
          const formData = new FormData();
          formData.append('file', value.logoFile);
          const config = {
            headers: {
              'content-type': 'multipart/form-data',
            },
          };
          const imageResponse = await api.post(`/v1/images`, formData, config);
          image = imageResponse?.data?.image;
        }
        const data = {
          participantType: ENROLLMENT_TYPE.TEAM,
          status: 'PENDING',
          requesterEmailId: requestorEmail,
          uniqueIdentifier: value.name,
          newData: { ...value, logoUid: image?.uid, logoUrl: image?.url },
          // captchaToken,
        };
        const response = await api.post(`/v1/participants-request`, data);
        trackGoal(FATHOM_EVENTS.directory.joinNetworkAsTeamSave, 0);
        analytics.captureEvent(
          APP_ANALYTICS_EVENTS.TEAM_JOIN_NETWORK_FORM_STEPS,
          {
            itemName: 'COMPLETED',
          }
        );
        setSaveCompleted(true);
      } catch (err) {
        if (err?.response?.status === 400) {
          toast(err?.response?.data?.message);
        } else {
          toast(err?.message);
        }
      } finally {
        setIsProcessing(false);
      }
    },
    // [executeRecaptcha, formValues]
    [formValues]
  );

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;
    setFormValues({ ...formValues, [name]: value });
  }

  const handleImageChange = (file: File | null) => {
    if (file) {
      setFormValues({ ...formValues, logoFile: file });
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => setImageUrl(reader.result as string);
    } else {
      setFormValues({ ...formValues, logoFile: null, logoUid: '' });
      setImageUrl('');
    }
  };

  function handleDropDownChange(selectedOption, name) {
    setFormValues({ ...formValues, [name]: selectedOption });
  }

  function getFormStep() {
    switch (formStep) {
      case 1:
        return (
          <AddTeamStepOne
            formValues={formValues}
            handleInputChange={handleInputChange}
            handleDropDownChange={handleDropDownChange}
            handleImageChange={handleImageChange}
            onNameBlur={onNameBlur}
            imageUrl={imageUrl}
            nameExists={nameExists}
            setDisableNext={setDisableNext}
          />
        );
      case 2:
        return (
          <AddTeamStepTwo
            formValues={formValues}
            dropDownValues={dropDownValues}
            handleInputChange={handleInputChange}
            handleDropDownChange={handleDropDownChange}
            handleFoucsAreaSave={handleFoucsAreaSave}
            focusAreas={rawData}
            from="Team join network"
          />
        );
      case 3:
        return (
          <AddTeamStepThree
            formValues={formValues}
            handleInputChange={handleInputChange}
          />
        );
      default:
        return (
          <AddTeamStepOne
            formValues={formValues}
            handleInputChange={handleInputChange}
            handleDropDownChange={handleDropDownChange}
          />
        );
    }
  }

  function handleFoucsAreaSave(values: any) {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.FOCUS_AREA_POPUP_SAVE_BTN_CLICKED,
      {
        focusAreas: values,
        userInfo:getUserInfo()
      }
    );
    setFormValues({ ...formValues, focusAreas: values });
  }

  const getFocusAreas = async () => {
    try {
      const focusAreasResponse = await api.get(
        `${FILTER_API_ROUTES.FOCUS_AREA}`
      );

      const rawData = focusAreasResponse.data;
      const filteredParents = rawData.filter((data) => !data.parentUid);
      setRawData(filteredParents);
    } catch (error) {
      setRawData([]);
    }
  };

  useEffect(() => {
    getFocusAreas();
  }, []);

  return (
    <>
      {isProcessing && (
        <div
          className={`fixed inset-0 z-[3000] flex items-center justify-center bg-gray-500 bg-opacity-50`}
        >
          <LoadingIndicator />
        </div>
      )}
      <Modal isOpen={isOpen} onClose={handleModalClose} modalRef={divRef}>
        <div className="w-[500px] rounded-lg bg-white">
          <ModalHeader onClose={handleModalClose} image={<TextImage />} />
          <div className="mt-40">
            {saveCompleted ? (
              <div>
                <div className="mb-3 text-center text-2xl font-bold">
                  Thank you for submitting
                </div>
                <div className="text-md mb-3 text-center">
                  Our team will review your request shortly & get back
                </div>
                <div className="text-center">
                  <button
                    className="shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus mb-5 inline-flex rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]"
                    onClick={() => handleModalClose()}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <FormStepsIndicator formStep={formStep} steps={teamFormSteps} />
                {errors?.length > 0 && (
                  <div className="w-full rounded-lg bg-white p-5 ">
                    <ul className="list-inside list-disc space-y-1 text-xs text-red-500">
                      {errors.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="px-11">{getFormStep()}</div>
                <div className="footerdiv flow-root w-full">
                  <div className="float-left">
                    {getCancelOrBackButton(
                      formStep,
                      handleModalClose,
                      setFormStep,
                      setErrors
                    )}
                  </div>
                  <div className="float-right">
                    {getSubmitOrNextButton(
                      formValues,
                      formStep,
                      setFormStep,
                      handleSubmit,
                      setErrors,
                      isProcessing,
                      nameExists,
                      disableNext,
                      divRef,
                      analytics
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}