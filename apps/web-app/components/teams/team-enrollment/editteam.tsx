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
import Cookies from 'js-cookie';
import AddTeamStepOne from './addteamstepone';
import AddTeamStepTwo from './addteamsteptwo';
import AddTeamStepThree from './addteamstepthree';
import Modal from '../../layout/navbar/modal/modal';
import {
  fetchMembershipSources,
  fetchFundingStages,
  fetchIndustryTags,
  fetchProtocol,
} from '../../../utils/services/dropdown-service';
import { fetchTeam } from '../../../utils/services/teams';
import { IFormValues } from '../../../utils/teams.types';
import api from '../../../utils/api';
import {
  BTN_LABEL_CONSTANTS,
  ENROLLMENT_TYPE,
  MSG_CONSTANTS,
  TAB_CONSTANTS,
  FATHOM_EVENTS,
  SETTINGS_CONSTANTS,
  APP_ANALYTICS_EVENTS,
  FILTER_API_ROUTES,
} from '../../../constants';
import { ReactComponent as TextImage } from '/public/assets/images/edit-team.svg';
import { LoadingIndicator } from '../../shared/loading-indicator/loading-indicator';
import { toast } from 'react-toastify';
import { ValidationErrorMessages } from '../../shared/account-setttings/validation-error-message';
import { DiscardChangesPopup } from 'libs/ui/src/lib/modals/confirmation';
import useAppAnalytics from '../../../hooks/shared/use-app-analytics';
// import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { ReactComponent as CloseIcon } from '/public/assets/images/icons/closeIcon.svg';
import { Dialog } from '@headlessui/react';
import { ModalHeader } from '../../shared/modal-header/modal-header';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';

interface EditTeamModalProps {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
  id: string;
  fromSettings?: boolean;
  setModified?: (boolean) => void;
  setRefreshTeamAutocomplete?: (boolean) => void;
}

function validateBasicForm(formValues, imageUrl) {
  const errors = [];
  const emailRE =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (
    !formValues.requestorEmail?.trim() ||
    !formValues.requestorEmail?.trim().match(emailRE)
  ) {
    //errors.push('Please add a valid Requestor email');
  }
  if (!formValues.name?.trim()) {
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
    errors.push('Please add IndustryTags');
  }
  return errors;
}

function validateSocialForm(formValues) {
  const errors = [];
  if (!formValues.contactMethod?.trim()) {
    errors.push('Please add Preferred method of contact');
  }
  if (!formValues.website?.trim()) {
    errors.push('Please add website');
  }
  return errors;
}

function validateForm(formValues, imageUrl) {
  let errors = [];
  const basicFormErrors = validateBasicForm(formValues, imageUrl);
  if (basicFormErrors.length) {
    errors = [...errors, ...basicFormErrors];
  }
  const projectDetailFormErrors = validateProjectDetailForm(formValues);
  if (projectDetailFormErrors.length) {
    errors = [...errors, ...projectDetailFormErrors];
  }
  const socialFormErrors = validateSocialForm(formValues);
  if (socialFormErrors.length) {
    errors = [...errors, ...socialFormErrors];
  }
  return {
    errors,
    basicFormErrors,
    projectDetailFormErrors,
    socialFormErrors,
  };
}

function getSubmitOrNextButton(
  handleSubmit,
  isProcessing,
  fromSettings,
  disableSubmit
) {
  const buttonClassName = `${
    fromSettings
      ? 'bg-[#156FF7]'
      : 'bg-gradient-to-r from-[#427DFF] to-[#44D5BB]'
  } shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-full justify-center rounded-full px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]`;
  const submitOrNextButton = (
    <button
      className={
        isProcessing || disableSubmit
          ? 'shadow-special-button-default inline-flex w-full justify-center rounded-full bg-slate-400 px-6 py-2 text-base font-semibold leading-6 text-white outline-none'
          : buttonClassName
      }
      disabled={isProcessing || disableSubmit}
      onClick={handleSubmit}
    >
      {fromSettings ? 'Save Changes' : 'Request Changes'}
    </button>
  );
  return submitOrNextButton;
}

function getCancelOrBackButton(handleModalClose) {
  const cancelorBackButton = (
    <button
      className="on-focus leading-3.5 text-md mb-2 mr-2 rounded-full border border-slate-300 px-5 py-3 text-left font-medium last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full"
      onClick={() => handleModalClose()}
    >
      Cancel
    </button>
  );
  return cancelorBackButton;
}

export function EditTeamModal({
  isOpen,
  setIsModalOpen,
  id,
  fromSettings = false,
  setModified,
  setRefreshTeamAutocomplete,
}: EditTeamModalProps) {
  const [errors, setErrors] = useState([]);
  const [basicErrors, setBasicErrors] = useState([]);
  const [projectErrors, seProjecttErrors] = useState([]);
  const [socialErrors, setSocialErrors] = useState([]);
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState<string>();
  const [imageChanged, setImageChanged] = useState<boolean>(false);
  const [isNameChanged, setNameChanged] = useState<boolean>(false);
  const [dropDownValues, setDropDownValues] = useState({});
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [saveCompleted, setSaveCompleted] = useState<boolean>(false);
  const [openTab, setOpenTab] = useState(1);
  const [isErrorPopupOpen, setIsErrorPopupOpen] = useState(false);
  const [disableSubmit, setDisableSubmit] = useState<boolean>(false);
  const [isModified, setModifiedFlag] = useState<boolean>(false);
  const [openValidationPopup, setOpenValidationPopup] =
    useState<boolean>(false);
  const [nameExists, setNameExists] = useState<boolean>(false);
  const [dataLoaded, setDataLoaded] = useState<boolean>(false);
  const [formValues, setFormValues] = useState<IFormValues>({
    name: '',
    requestorEmail: '',
    logoUid: '',
    logoFile: null,
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
    focusAreas: [],
    officeHours: '',
  });
  const divRef = useRef<HTMLDivElement>(null);
  const [resetImg, setResetImg] = useState(false);
  const analytics = useAppAnalytics();
  const [focusAreas, setFocusAreas] = useState([]);
  // const { executeRecaptcha } = useGoogleReCaptcha();

  useEffect(() => {
    if (saveCompleted) {
      toast(MSG_CONSTANTS.TEAM_UPDATE_MESSAGE);
    }
  }, [saveCompleted]);

  useEffect(() => {
    if (fromSettings) {
      resetState();
      setOpenTab(1);
    }
    if (isOpen) {
      setTeamDetails();
    }
  }, [isOpen, id]);

  const setTeamDetails = () => {
    setIsProcessing(true);
    setDataLoaded(false);
    Promise.all([
      fetchTeam(id),
      fetchMembershipSources(),
      fetchFundingStages(),
      fetchIndustryTags(),
      fetchProtocol(),
    ])
      .then((data) => {
        const team = data[0];
        const formValues = {
          name: team.name,
          logoUid: team.logoUid,
          logoFile: null,
          shortDescription: team.shortDescription,
          longDescription: team.longDescription,
          technologies: team.technologies?.map((item) => {
            return { value: item.uid, label: item.title };
          }),
          fundingStage: {
            value: team.fundingStage?.uid,
            label: team.fundingStage?.title,
          },
          membershipSources: team.membershipSources?.map((item) => {
            return { value: item.uid, label: item.title };
          }),
          industryTags: team.industryTags?.map((item) => {
            return { value: item.uid, label: item.title };
          }),
          contactMethod: team.contactMethod,
          website: team.website,
          linkedinHandler: team.linkedinHandler,
          telegramHandler: team.telegramHandler,
          twitterHandler: team.twitterHandler,
          blog: team.blog,
          officeHours: team.officeHours,
          focusAreas: team.teamFocusAreas,
        };

        // set requestor email
        const userInfoFromCookie = Cookies.get('userInfo');
        if (userInfoFromCookie) {
          const parsedUserInfo = JSON.parse(userInfoFromCookie);
          formValues['requestorEmail'] = parsedUserInfo.email;
        }
        setFormValues(formValues);
        setName(team.name);
        setImageUrl(team.logo?.url ?? '');
        setDropDownValues({
          membershipSources: data[1],
          fundingStages: data[2],
          industryTags: data[3],
          protocol: data[4],
        });
        setDataLoaded(true);
      })
      .catch((err) => {
        toast(err?.message, {
          type: 'error',
        });
        console.error(err);
      })
      .finally(() => {
        setIsProcessing(false);
      });
  };

  function resetState() {
    setModified(false);
    setModifiedFlag(false);
    setErrors([]);
    setBasicErrors([]);
    setNameChanged(false);
    seProjecttErrors([]);
    setSocialErrors([]);
    setDropDownValues({});
    setImageChanged(false);
    setDropDownValues({});
    setDisableSubmit(false);
    setNameExists(false);
    setName('');
    setIsProcessing(false);
    setFormValues({
      name: '',
      requestorEmail: '',
      logoUid: '',
      logoFile: null,
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
      focusAreas: [],
      officeHours: '',
    });
  }

  function handleModalClose() {
    resetState();
    setIsModalOpen(false);
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
      oldName: name,
    };
    delete formattedValue.requestorEmail;
    return formattedValue;
  }

  function onNameBlur(event: ChangeEvent<HTMLInputElement>) {
    const data = {
      uniqueIdentifier: event.target.value?.trim(),
      participantType: ENROLLMENT_TYPE.TEAM,
      uid: id,
    };
    api
      .post(`/v1/participants-request/unique-identifier`, data)
      .then((response) => {
        setDisableSubmit(false);
        response?.data &&
        (response.data?.isUniqueIdentifierExist ||
          response.data?.isRequestPending)
          ? setNameExists(true)
          : setNameExists(false);
      });
  }

  const handleSubmit = useCallback(
    async (e) => {
      setResetImg(true);
      if (isModified) {
        setRefreshTeamAutocomplete(false);
        setSaveCompleted(false);
        e.preventDefault();
        // if (!executeRecaptcha) {
        //   console.log('Execute recaptcha not yet available');
        //   return;
        // }
        setErrors([]);
        setBasicErrors([]);
        seProjecttErrors([]);
        setSocialErrors([]);
        const {
          errors,
          basicFormErrors,
          projectDetailFormErrors,
          socialFormErrors,
        } = validateForm(formValues, imageUrl);
        if (errors?.length > 0 || nameExists) {
          if (nameExists) {
            basicFormErrors.push('Name already exists');
          }
          setErrors(errors);
          setBasicErrors(basicFormErrors);
          seProjecttErrors(projectDetailFormErrors);
          setSocialErrors(socialFormErrors);
          setIsErrorPopupOpen(true);
          return false;
        }
        trackGoal(FATHOM_EVENTS.teams.profile.editSave, 0);
        const values = formatData();
        try {
          // const captchaToken = await executeRecaptcha();

          // if (!captchaToken) return;
          let image;
          setIsProcessing(true);
          if (imageChanged && values.logoFile) {
            const formData = new FormData();
            formData.append('file', values.logoFile);
            const config = {
              headers: {
                'content-type': 'multipart/form-data',
              },
            };
            const imageResponse = await api.post(
              `/v1/images`,
              formData,
              config
            );
            image = imageResponse?.data?.image;
          }
          delete values?.logoFile;
          const data = {
            participantType: ENROLLMENT_TYPE.TEAM,
            referenceUid: id,
            uniqueIdentifier: values.name,
            newData: {
              ...values,
              logoUid: image?.uid ?? values.logoUid,
              logoUrl: image?.url ?? imageUrl,
            },
            // captchaToken,
          };
          const res = await api.put(`/v1/teams/${id}`, data);
          if (res.status === 200 && res.statusText === 'OK')
            setSaveCompleted(true);
          getFocusAreas();
          analytics.captureEvent(
            APP_ANALYTICS_EVENTS.SETTINGS_TEAM_PROFILE_EDIT_FORM,
            {
              itemName: 'COMPLETED',
            }
          );
          if (fromSettings) {
            setModified(false);
            setModifiedFlag(false);
            setOpenTab(1);
            if (imageChanged || isNameChanged) {
              setRefreshTeamAutocomplete(true);
            }
          }
        } catch (err) {
          // toast(err?.message,{
          //   type:'error'
          // });
          // console.log('error', err);
        } finally {
          setIsProcessing(false);
        }
      } else {
        toast(MSG_CONSTANTS.NO_CHANGES_TO_SAVE, {
          type: 'info',
        });
      }
    },
    // [executeRecaptcha, formValues, imageUrl, imageChanged, id]
    [formValues, imageUrl, isProcessing, imageChanged, id, nameExists]
  );

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;
    if (name === 'name') {
      setNameChanged(true);
    }
    setModified(true);
    setModifiedFlag(true);
    setFormValues({ ...formValues, [name]: value });
  }

  const handleResetImg = () => {
    setResetImg(false);
  };

  const handleImageChange = (file: File) => {
    if (file) {
      setFormValues({ ...formValues, logoFile: file });
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => setImageUrl(reader.result as string);
    } else {
      setFormValues({ ...formValues, logoFile: null, logoUid: '' });
      setImageUrl('');
    }
    setModified(true);
    setModifiedFlag(true);
    setImageChanged(true);
  };

  function handleDropDownChange(selectedOption, name) {
    setFormValues({ ...formValues, [name]: selectedOption });
    setModified(true);
    setModifiedFlag(true);
  }

  const handleFocusSubmit = (focusAreas) => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.FOCUS_AREA_POPUP_SAVE_BTN_CLICKED,
      {
        focusAreas,
        userInfo: getUserInfo(),
        team: formValues,
      }
    );
    const isSame =
      JSON.stringify(formValues.focusAreas) === JSON.stringify(focusAreas);
    if (!isSame) {
      setFormValues({ ...formValues, focusAreas: focusAreas });
      setModified(true);
      setModifiedFlag(true);
    }
  };

  function saveCompletedTemplate() {
    return (
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
            Return to home
          </button>
        </div>
      </div>
    );
  }

  const getResetButton = (handleReset) => {
    const resetButton = (
      <button
        className="hadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-full justify-center rounded-full px-6 py-2 text-base font-semibold leading-6 text-[#156FF7] outline outline-1 outline-[#156FF7] hover:outline-2"
        onClick={() => handleReset()}
      >
        {BTN_LABEL_CONSTANTS.RESET}
      </button>
    );
    return resetButton;
  };

  const onTabSelected = (tab) => {
    const allTabs = ['BASIC', 'PROJECT DETAILS', 'SOCIAL'];
    setOpenTab(tab);
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.SETTINGS_TEAM_PROFILE_EDIT_FORM,
      {
        itemName: allTabs[tab - 1],
      }
    );
  };

  const handleReset = () => {
    if (fromSettings) {
      setResetImg(true);
      if (isModified) {
        setOpenValidationPopup(true);
      } else {
        toast(MSG_CONSTANTS.NO_CHANGES_TO_RESET, {
          type: 'info',
        });
      }
    }
  };

  const confirmationClose = (flag) => {
    setOpenValidationPopup(false);
    if (flag) {
      setErrors([]);
      setBasicErrors([]);
      seProjecttErrors([]);
      setSocialErrors([]);
      resetState();
      setTeamDetails();
      setOpenTab(1);
      setModified(false);
      setModifiedFlag(false);
    }
  };

  useEffect(() => {
    getFocusAreas();
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.SETTINGS_TEAM_PROFILE_EDIT_FORM,
      {
        itemName: 'BASIC',
      }
    );
  }, []);

  const getFocusAreas = async () => {
    try {
      const focusAreasResponse = await api.get(
        `${FILTER_API_ROUTES.FOCUS_AREA}`
      );
      const result = focusAreasResponse?.data ?? [];
      const filteredData = result.filter((data) => !data.parentUid);
      setFocusAreas(filteredData);
    } catch (error) {
      setFocusAreas([]);
    }
  };

  function beforeSaveTemplate() {
    return (
      <div>
        <div
          className={`px-11 ${
            fromSettings ? 'mt-[24px]  rounded-t-[8px] bg-white pt-[24px]' : ''
          } `}
        >
          <span className="font-size-14 text-sm">
            {SETTINGS_CONSTANTS.TEAM_HELP_TXT}
          </span>
        </div>

        {errors?.length > 0 && !fromSettings && (
          <div className="w-full rounded-lg bg-white p-5 ">
            <ul className="list-inside list-disc space-y-1 text-xs text-red-500">
              {errors.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        <div
          className={`overflow-y-auto px-11 ${
            fromSettings ? 'mb-[90px] rounded-[8px] bg-white pb-[24px]' : ''
          }`}
        >
          <div className={openTab === 1 || !fromSettings ? 'block' : 'hidden'}>
            <AddTeamStepOne
              formValues={formValues}
              handleInputChange={handleInputChange}
              handleDropDownChange={handleDropDownChange}
              handleImageChange={handleImageChange}
              imageUrl={imageUrl}
              isEditMode={true}
              disableRequestorEmail={true}
              fromSettings={true}
              resetImg={resetImg}
              onNameBlur={onNameBlur}
              nameExists={nameExists}
              onResetImg={handleResetImg}
              dataLoaded={dataLoaded}
              setDisableNext={setDisableSubmit}
            />
          </div>
          <div className={openTab === 2 || !fromSettings ? 'block' : 'hidden'}>
            <AddTeamStepTwo
              focusAreas={focusAreas}
              handleFoucsAreaSave={handleFocusSubmit}
              formValues={formValues}
              dropDownValues={dropDownValues}
              handleInputChange={handleInputChange}
              handleDropDownChange={handleDropDownChange}
              from="Edit team"
              isRequired
            />
          </div>
          <div className={openTab === 3 || !fromSettings ? 'block' : 'hidden'}>
            <AddTeamStepThree
              formValues={formValues}
              handleInputChange={handleInputChange}
              handleDropDownChange={handleDropDownChange}
            />
          </div>
        </div>
        {
          <div
            className={`footerdiv flow-root w-full ${
              fromSettings ? 'fixed inset-x-0 bottom-0 h-[80px] bg-white' : ''
            }`}
          >
            {!fromSettings && (
              <div className="float-left">
                {getCancelOrBackButton(handleModalClose)}
              </div>
            )}
            <div className="flex justify-center">
              <div className="mx-5">
                {getResetButton(() => {
                  handleReset();
                })}
              </div>
              <div>
                {getSubmitOrNextButton(
                  handleSubmit,
                  isProcessing,
                  fromSettings,
                  disableSubmit
                )}
              </div>
            </div>
          </div>
        }
        {
          <ValidationErrorMessages
            isOpen={isErrorPopupOpen}
            from={'team'}
            setIsModalOpen={() => {
              setIsErrorPopupOpen(false);
            }}
            errors={{
              basic: basicErrors,
              project: projectErrors,
              social: socialErrors,
            }}
          />
        }
      </div>
    );
  }

  return (
    <>
      {isProcessing && (
        <div
          className={`fixed inset-0 z-[3000] flex items-center justify-center bg-gray-500 bg-opacity-50`}
        >
          <LoadingIndicator />
        </div>
      )}
      <div className="outline-0">
        {fromSettings ? (
          <>
            {
              <div className="mt-3 flex h-10 justify-start  gap-[25px] text-slate-400">
                <button
                  className={`border-b-4 border-transparent text-base font-medium ${
                    openTab == 1 ? 'border-b-[#156FF7] text-[#156FF7]' : ''
                  } ${
                    basicErrors?.length > 0 && openTab == 1
                      ? 'border-b-[#DD2C5A] text-[#DD2C5A]'
                      : basicErrors?.length > 0
                      ? 'text-[#DD2C5A]'
                      : ''
                  }`}
                  onClick={() => onTabSelected(1)}
                >
                  {' '}
                  {TAB_CONSTANTS.BASIC}{' '}
                </button>
                <button
                  className={` border-b-4 border-transparent text-base font-medium ${
                    openTab == 2 ? 'border-b-[#156FF7] text-[#156FF7]' : ''
                  } ${
                    projectErrors?.length > 0 && openTab == 2
                      ? 'border-b-[#DD2C5A] text-[#DD2C5A]'
                      : projectErrors?.length > 0
                      ? 'text-[#DD2C5A]'
                      : ''
                  }`}
                  onClick={() => onTabSelected(2)}
                >
                  {' '}
                  {TAB_CONSTANTS.PROJECT_DETAILS}
                </button>
                <button
                  className={` border-b-4  border-transparent text-base font-medium ${
                    openTab == 3 ? 'border-b-[#156FF7] text-[#156FF7]' : ''
                  } ${
                    socialErrors?.length > 0 && openTab == 3
                      ? 'border-b-[#DD2C5A] text-[#DD2C5A]'
                      : socialErrors?.length > 0
                      ? 'text-[#DD2C5A]'
                      : ''
                  }`}
                  onClick={() => onTabSelected(3)}
                >
                  {' '}
                  {TAB_CONSTANTS.SOCIAL}{' '}
                </button>
              </div>
            }
            {beforeSaveTemplate()}
            <DiscardChangesPopup
              text={MSG_CONSTANTS.RESET_CHANGE_CONF_MSG}
              isOpen={openValidationPopup}
              onCloseFn={confirmationClose}
            />
          </>
        ) : (
          <Modal isOpen={isOpen} onClose={handleModalClose}>
            <div>
              <ModalHeader onClose={handleModalClose} image={<TextImage />} />
              {saveCompleted ? saveCompletedTemplate() : beforeSaveTemplate()}
            </div>
          </Modal>
        )}
      </div>
    </>
  );
}