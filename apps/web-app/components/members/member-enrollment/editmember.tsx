import {
  Dispatch,
  SetStateAction,
  useState,
  useEffect,
  ChangeEvent,
  useCallback,
  Fragment,
  useRef,
  useContext
} from 'react';
import { trackGoal } from 'fathom-client';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import AddMemberBasicForm from './addmemberbasicform';
import AddMemberSkillForm from './addmemberskillform';
import AddMemberSocialForm from './addmembersocialform';
import { ValidationErrorMessages } from '../../../components/shared/account-setttings/validation-error-message';
import {
  MSG_CONSTANTS,
  PAGE_ROUTES,
  FATHOM_EVENTS,
  APP_ANALYTICS_EVENTS,
  SETTINGS_CONSTANTS,
  PRIVACY_CONSTANTS,
} from '../../../constants';
import { RequestPending } from '../../shared/request-pending/request-pending';
import { IFormValues } from '../../../utils/members.types';
import Modal from '../../layout/navbar/modal/modal';
import {
  fetchSkills,
  fetchTeams,
} from '../../../utils/services/dropdown-service';
import { fetchMember } from '../../../utils/services/members';
import { InputField } from '@protocol-labs-network/ui';
import api from '../../../utils/api';
import { ENROLLMENT_TYPE } from '../../../constants';
import { ReactComponent as TextImage } from '/public/assets/images/edit-member.svg';
import { LoadingIndicator } from '../../shared/loading-indicator/loading-indicator';
import { toast } from 'react-toastify';
import orderBy from 'lodash/orderBy';
import { requestPendingCheck } from '../../../utils/services/members';
import { DiscardChangesPopup } from '../../../../../libs/ui/src/lib/modals/confirmation';
import {
  calculateExpiry,
  createLogoutChannel,
  decodeToken,
} from '../../../utils/services/auth';
import ChangeEmailModal from '../../auth/change-email-modal';
// import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import useAppAnalytics from '../../../hooks/shared/use-app-analytics';
import { ReactComponent as PrefernceIcon } from '../../../public/assets/images/icons/preferences.svg';
import { PreferenceModal } from './preference-modal';
import Privacy from '../../preference/privacy';
import { getPreferences } from 'apps/web-app/services/member.service';
import { SettingsContext } from "apps/web-app/pages/directory/settings";
import AddMemberExperience from './add-member-experience';
interface EditMemberModalProps {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
  id: string;
  isProfileSettings?: boolean;
  isUserProfile?: boolean;
  userInfo?: any;
  setModified?: (boolean) => void;
  setRefreshMemberAutocomplete?: (boolean) => void;
}

function validateBasicForm(formValues, imageUrl, isProfileSettings) {
  const errors = [];
  const emailRE =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (!formValues.name.trim()) {
    errors.push('Please add your Name');
  }
  if (!formValues?.email?.trim() || !formValues.email?.trim().match(emailRE)) {
    errors.push('Please add valid Email');
  }
  if (!isProfileSettings) {
    if (
      !formValues.requestorEmail?.trim() ||
      !formValues.requestorEmail?.match(emailRE)
    ) {
      errors.push('Please add a valid Requestor Email');
    }
  }
  return errors;
}

function validateSkillForm(formValues) {
  const errors = [];
  if (!formValues?.teamAndRoles.length) {
    errors.push('Please add your Team and Role details');
  } else {
    const missingValues = formValues?.teamAndRoles.filter(
      (item) => item.teamUid == '' || item.role == ''
    );
    if (missingValues.length) {
      errors.push('Please add missing Team(s)/Role(s)');
    }
  }
  if (!formValues.skills.length) {
    errors.push('Please add your skill details');
  }
  return errors;
}

function validateExperienceForm(fValues) {
  const formErrors = []
  const exps = fValues.experience;
  exps.forEach((exp, expIndex) => {
    if(exp.companyName.trim() === '') {
      formErrors.push({id: expIndex, field: 'companyName', error: "Company Name is Mandatory"})
    } if(exp.title.trim() === '') {
      formErrors.push({id: expIndex, field: 'title', error: "Title is Mandatory"})
    } if(exp.endDate && exp.startDate.getTime() >= exp.endDate.getTime()) {
      formErrors.push({id: expIndex, field: 'date', error: "To Date cannot be less than start date"})
    }
  })

  return formErrors
}

function validateForm(formValues, imageUrl, isProfileSettings) {
  let errors = [];
  const basicFormErrors = validateBasicForm(
    formValues,
    imageUrl,
    isProfileSettings
  );
  if (basicFormErrors.length) {
    errors = [...errors, ...basicFormErrors];
  }
  const skillFormErrors = validateSkillForm(formValues);
  if (skillFormErrors.length) {
    errors = [...errors, ...skillFormErrors];
  }

  const experienceFormErrors = validateExperienceForm(formValues);
  if(experienceFormErrors.length > 0) {
    errors.push("Please review experience details")
  }

  return {
    basicFormErrors,
    skillFormErrors,
    experienceFormErrors,
    errors,
  };
}

function getSubmitOrNextButton(
  handleSubmit,
  isProcessing,
  isProfileSettings,
  disableSubmit
) {
  const buttonClassName = `${
    isProfileSettings
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
      {isProfileSettings ? 'Save Changes' : 'Request Changes'}
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

function getResetButton(handleReset) {
  const resetButton = (
    <button
      className="hadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-full justify-center rounded-full px-6 py-2 text-base font-semibold leading-6 text-[#156FF7] outline outline-1 outline-[#156FF7] hover:outline-2"
      onClick={() => handleReset()}
    >
      Reset
    </button>
  );
  return resetButton;
}

export function EditMemberModal({
  isOpen,
  setIsModalOpen,
  id,
  isProfileSettings = false,
  userInfo,
  isUserProfile = false,
  setModified,
  setRefreshMemberAutocomplete,
}: EditMemberModalProps) {
  const [openTab, setOpenTab] = useState(1);
  const [errors, setErrors] = useState([]);
  const [isErrorPopupOpen, setIsErrorPopupOpen] = useState(false);
  const [basicErrors, setBasicErrors] = useState([]);
  const [skillErrors, setSkillErrors] = useState([]);
  const [expErrors, setExperienceErrors] = useState([]);
  const [dropDownValues, setDropDownValues] = useState({});
  const [imageUrl, setImageUrl] = useState<string>();
  const [emailExists, setEmailExists] = useState<boolean>(false);
  const [imageChanged, setImageChanged] = useState<boolean>(false);
  const [isNameChanged, setNameChanged] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [saveCompleted, setSaveCompleted] = useState<boolean>(false);
  const [disableSubmit, setDisableSubmit] = useState<boolean>(false);
  const [dataLoaded, setDataLoaded] = useState<boolean>(false);
  const [isModified, setModifiedFlag] = useState<boolean>(false);
  const [openValidationPopup, setOpenValidationPopup] =
    useState<boolean>(false);
  const [isEmailEditActive, setEmailEditStatus] = useState<boolean>(false);
  const [openPreference, setOpenPreferenceFlag] = useState<boolean>(false);
  const [currentEmail, setCurrentEmail] = useState('');
  const [formValues, setFormValues] = useState<IFormValues>({
    name: '',
    email: '',
    requestorEmail: '',
    imageUid: '',
    imageFile: null,
    plnStartDate: null,
    city: '',
    region: '',
    country: '',
    linkedinHandler: '',
    discordHandler: '',
    twitterHandler: '',
    githubHandler: '',
    telegramHandler: '',
    officeHours: '',
    comments: '',
    teamAndRoles: [{ teamUid: '', teamTitle: '', role: '', rowId: 1 }],
    skills: [],
    experience: [],
    openToWork: false,
    preferences: JSON.parse(JSON.stringify(PRIVACY_CONSTANTS.DEFAULT_SETTINGS))
  });

  const [isPendingRequestModalOpen, setIsPendingRequestModalOpen] =
    useState(false);
  const [reset, setReset] = useState(false);
  const router = useRouter();
  const [resetImg, setResetImg] = useState(false);
  const analytics = useAppAnalytics();
  const {state, dispatch} = useContext(SettingsContext);
  const divRef = useRef<HTMLDivElement>(null);

  const onCancelEmailChange = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.SETTINGS_MEMBER_CHANGE_EMAIL_CANCELLED,
      {}
    );
    setEmailEditStatus(false);
    handleInputChange({
      target: { name: 'email', value: currentEmail },
    });
  };

  const onNewEmailInputChange = (newEmailValue) => {
    setFormValues((v) => (v['email'] = newEmailValue));
  };

  const onChangeEmailClose = (step) => {
    setEmailEditStatus(false);
    if (step && step === 3) {
      window.location.reload();
      return;
    }
  };

  const logoutAndRedirect = (path) => {
     // If no token.. then logout user
    Cookies.remove('authToken', { path: '/', domain: process.env.COOKIE_DOMAIN || '' });
    Cookies.remove('refreshToken', { path: '/', domain: process.env.COOKIE_DOMAIN || ''});
    Cookies.remove('userInfo', { path: '/', domain: process.env.COOKIE_DOMAIN || '' });
    Cookies.set('page_params', 'user_logged_out', {
      expires: 60,
      path: '/',
    });
     createLogoutChannel().postMessage('logout');
     window.location.href = path;
  }

  const onEmailChange = () => {
    if (isUserProfile) {
      analytics.captureEvent(
        APP_ANALYTICS_EVENTS.SETTINGS_USER_CHANGE_EMAIL_CLICKED,
        {}
      );
      const authToken = Cookies.get('authToken');
      if (!authToken) {
        logoutAndRedirect(PAGE_ROUTES.MEMBERS)
      }

      setEmailEditStatus(true);

    } else {
      analytics.captureEvent(
        APP_ANALYTICS_EVENTS.SETTINGS_MEMBER_CHANGE_EMAIL_CLICKED,
        {}
      );
      setEmailEditStatus(true);
    }
  };

  // const { executeRecaptcha } = useGoogleReCaptcha();

  useEffect(() => {
    if (isOpen || isProfileSettings) {
      resetState();
      setOpenTab(1);
      getMemberDetails();
    }
  }, [isOpen, id, isProfileSettings]);

  useEffect(() => {
    if (saveCompleted) {
      toast(MSG_CONSTANTS.MEMBER_UPDATE_MESSAGE);
    }
  }, [saveCompleted]);

  const getMemberDetails = () => {
    setIsProcessing(true);
    setDataLoaded(false);
    setEmailEditStatus(false);
    Promise.all([fetchMember(id), fetchSkills(), fetchTeams()])
      .then((data) => {
        const member = data[0];
        let counter = 1;
        let teamAndRoles = member?.teamMemberRoles?.length
          ? member.teamMemberRoles
          : [];
        teamAndRoles = orderBy(
          teamAndRoles,
          ['mainTeam', 'team.name'],
          ['desc', 'asc']
        );

        teamAndRoles = teamAndRoles?.map((item) => {
          return {
            role: item.role,
            teamUid: item?.team?.uid,
            teamTitle: item?.team?.name,
            rowId: counter++,
            mainTeam: item.mainTeam,
          };
        });
        setCurrentEmail(member?.email);
        const formValues = {
          name: member?.name,
          email: member?.email,
          openToWork: member?.openToWork ?? false,
          imageUid: member?.imageUid,
          imageFile: null,
          plnStartDate: member?.plnStartDate
            ? new Date(member?.plnStartDate).toISOString().split('T')[0]
            : null,
          city: member?.location?.city,
          region: member?.location?.region,
          country: member?.location?.country,
          linkedinHandler: member?.linkedinHandler,
          discordHandler: member?.discordHandler,
          twitterHandler: member?.twitterHandler,
          githubHandler: member?.githubHandler,
          telegramHandler: member?.telegramHandler,
          officeHours: member?.officeHours,
          comments: '',
          teamAndRoles: teamAndRoles || [
            { teamUid: '', teamTitle: '', role: '', rowId: 1 },
          ],
          skills: member?.skills?.map((item) => {
            return { value: item.uid, label: item.title };
          }),
          experience: member?.experience.map(exp => {
            exp.startDate = new Date(exp.startDate);
            exp.endDate = exp.endDate ? new Date(exp.endDate) : null;

            return exp;
          }),
          preferences: member?.preferences ?? JSON.parse(JSON.stringify(PRIVACY_CONSTANTS.DEFAULT_SETTINGS))
        };
        // set requestor email
        const userInfoFromCookie = Cookies.get('userInfo');
        if (userInfoFromCookie) {
          const parsedUserInfo = JSON.parse(userInfoFromCookie);
          formValues['requestorEmail'] = parsedUserInfo.email;
        }

        setImageUrl(member?.image?.url ?? '');
        setFormValues(formValues);
        setDropDownValues({ skillValues: data[1], teamNames: data[2] });
        setDataLoaded(true);
      })
      .catch((err) => {
        toast(err?.message, {
          type: 'error',
        });
        console.log('error', err);
      })
      .finally(() => {
        setIsProcessing(false);
      });
  };

  const confirmationClose = (flag) => {
    setOpenValidationPopup(false);
    if (flag) {
      setErrors([]);
      setBasicErrors([]);
      setSkillErrors([]);
      getMemberDetails();
      setModified(false);
      setModifiedFlag(false);
    }
  };

  function handleReset() {
    if (isProfileSettings) {
      setResetImg(true);
      // setEmailEditStatus(false);
      if (isModified) {
        setOpenValidationPopup(true);
      } else {
        toast(MSG_CONSTANTS.NO_CHANGES_TO_RESET, {
          type: 'info',
        });
      }
    }
  }

  function resetState() {
    setModified(false);
    setModifiedFlag(false);
    setErrors([]);
    setBasicErrors([]);
    setSkillErrors([]);
    setDropDownValues({});
    setImageChanged(false);
    setNameChanged(false);
    setIsProcessing(false);
    setDisableSubmit(false);
    setImageUrl('');
    setFormValues({
      name: '',
      email: '',
      requestorEmail: '',
      imageUid: '',
      imageFile: null,
      plnStartDate: null,
      city: '',
      region: '',
      country: '',
      linkedinHandler: '',
      discordHandler: '',
      twitterHandler: '',
      githubHandler: '',
      telegramHandler: '',
      officeHours: '',
      comments: '',
      teamAndRoles: [],
      skills: [],
      experience: [],
      openToWork: false,
    });
  }

  function handleModalClose() {
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

  const returnToHome = () => {
    router.push('/directory/members');
  };

  function formatData() {
    const teamAndRoles = structuredClone(formValues?.teamAndRoles);
    const formattedTeamAndRoles = teamAndRoles?.map((item) => {
      delete item.rowId;
      return item;
    });
    const skillValues = structuredClone(formValues.skills);
    const skills = skillValues.map((item) => {
      return { uid: item?.value, title: item?.label };
    });
    const formattedData = {
      ...formValues,
      name: formValues.name?.replace(/ +(?= )/g, '').trim(),
      email: formValues.email.trim(),
      city: formValues.city?.trim(),
      region: formValues.region?.trim(),
      country: formValues.country?.trim(),
      linkedinHandler: formValues.linkedinHandler?.trim(),
      discordHandler: formValues.discordHandler?.trim(),
      twitterHandler: formValues.twitterHandler?.trim(),
      githubHandler: formValues.githubHandler?.trim(),
      telegramHandler: formValues.telegramHandler?.trim(),
      officeHours:
        formValues.officeHours?.trim() === ''
          ? null
          : formValues.officeHours?.trim(),
      comments: formValues.comments?.trim(),
      plnStartDate: formValues.plnStartDate
        ? new Date(formValues.plnStartDate)?.toISOString()
        : null,
      skills: skills,
      experience:[...formValues.experience].map(v => {
        delete v.logoUrl;
        if (v.logoUid === 0 || v.logoUid === null) {
          delete v.logoUid
        }

        if(v.endDate === null) {
          delete v.endDate
        }

        return v
      }),
      teamAndRoles: formattedTeamAndRoles,
      openToWork: formValues.openToWork,
    };
    return formattedData;
  }

  function onEmailBlur(event: ChangeEvent<HTMLInputElement>) {
    const data = {
      uniqueIdentifier: event.target.value?.trim(),
      participantType: ENROLLMENT_TYPE.MEMBER,
      uid: id,
    };

    api
      .post(`/v1/participants-request/unique-identifier`, data)
      .then((response) => {
        setDisableSubmit(false);
        response?.data &&
        (response.data?.isUniqueIdentifierExist ||
          response.data?.isRequestPending)
          ? setEmailExists(true)
          : setEmailExists(false);
      });
  }

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setResetImg(true);
      if (isModified) {
        setImageChanged(false);
        if (setRefreshMemberAutocomplete) {
          setRefreshMemberAutocomplete(false);
        }
        setSaveCompleted(false);
        setErrors([]);
        const { basicFormErrors, skillFormErrors, experienceFormErrors,  errors } = validateForm(
          formValues,
          imageUrl,
          isProfileSettings
        );
        // if (!executeRecaptcha) {
        //   console.log('Execute recaptcha not yet available');
        //   return;
        // }
        if (errors?.length > 0 || emailExists) {
          const element1 = divRef.current;
          if (element1) {
            element1.scrollTo({ top: 0, behavior: 'smooth' });
            // element1.scrollTop = 0;
          }
          setErrors(errors);
          setBasicErrors(basicFormErrors);
          setSkillErrors(skillFormErrors);
          setExperienceErrors(experienceFormErrors)
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
          if (imageChanged && values.imageFile) {
            const formData = new FormData();
            formData.append('file', values.imageFile);
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

          delete values?.imageFile;
          delete values?.requestorEmail;

          const data = {
            participantType: ENROLLMENT_TYPE.MEMBER,
            referenceUid: id,
            uniqueIdentifier: values.email,
            newData: {
              ...values,
              imageUid: image?.uid ?? values.imageUid,
              imageUrl: image?.url ?? imageUrl,
            },
            // captchaToken,
          };
          if (!isProfileSettings) {
            const userInfoFromCookie = Cookies.get('userInfo');
            if (!userInfoFromCookie) {
              Cookies.set('page_params', 'user_logged_out', {
                expires: 60,
                path: '/',
              });
              router.push(PAGE_ROUTES.TEAMS);
              return false;
            }
            const res = await requestPendingCheck(values.email, id);
            if (res?.isRequestPending) {
              setIsPendingRequestModalOpen(true);
              return false;
            }
          }
          const response = await api.put(`/v1/member/${id}`, data);
          if (response.status === 200 && response.statusText === 'OK') {
            setSaveCompleted(true);
            setModified(false);
            setModifiedFlag(false);
            setOpenTab(1);
            setBasicErrors([]);
            setSkillErrors([]);
            if (
              (imageChanged || isNameChanged) &&
              setRefreshMemberAutocomplete
            ) {
              setRefreshMemberAutocomplete(true);
            }
            if (isEmailEditActive) {
              setCurrentEmail(formValues.email as any);
              setEmailEditStatus(false);
              analytics.captureEvent(
                APP_ANALYTICS_EVENTS.SETTINGS_MEMBER_CHANGE_EMAIL_SUCCESS,
                {}
              );
            }
            dispatch({type: 'SET_PREFERENCE',
              payload: {
                ...values.preferences,
                email: values.email != "" ? true : false,
                github: values.githubHandler != "" ? true : false,
                linkedin: values.linkedinHandler != "" ? true : false,
                twitter: values.twitterHandler != ""? true : false,
                telegram: values.telegramHandler != ""? true : false,
                discord: values.discordHandler != ""? true: false
              }
            });
            analytics.captureEvent(
              isUserProfile
                ? APP_ANALYTICS_EVENTS.SETTINGS_USER_PROFILE_EDIT_FORM
                : APP_ANALYTICS_EVENTS.SETTINGS_MEMBER_PROFILE_EDIT_FORM,
              {
                name: 'COMPLETED',
              }
            );
          }
        } catch (err) {
          // if (err?.response?.status === 400) {
          //   toast(err?.response?.data?.message, {
          //     type: 'error',
          //   });
          // } else {
          //   toast(err?.message, {
          //     type: 'error',
          //   });
          // }
        } finally {
          setModified(false);
          setModifiedFlag(false);
          setIsProcessing(false);
        }
      } else {
        toast(MSG_CONSTANTS.NO_CHANGES_TO_SAVE, {
          type: 'info',
        });
      }
    },
    // [executeRecaptcha, formValues, imageUrl, imageChanged]
    [formValues, imageUrl, imageChanged, emailExists, isModified]
  );

  function handleAddNewRole() {
    const newRoles = formValues?.teamAndRoles;
    const counter =
      newRoles.length == 0
        ? 1
        : Math.max(...newRoles.map((item) => item.rowId + 1));
    newRoles.push({ teamUid: '', teamTitle: '', role: '', rowId: counter });
    setFormValues({ ...formValues, teamAndRoles: newRoles });
    setModified(true);
    setModifiedFlag(true);
  }

  function updateParentTeamValue(teamUid, teamTitle, rowId) {
    const newTeamAndRoles = formValues?.teamAndRoles;
    const index = newTeamAndRoles.findIndex((item) => item.rowId == rowId);
    newTeamAndRoles[index].teamUid = teamUid;
    newTeamAndRoles[index].teamTitle = teamTitle;
    setFormValues({ ...formValues, teamAndRoles: newTeamAndRoles });
    setModified(true);
    setModifiedFlag(true);
  }

  function updateParentRoleValue(role, rowId) {
    const newTeamAndRoles = formValues?.teamAndRoles;
    const index = newTeamAndRoles.findIndex((item) => item.rowId == rowId);
    newTeamAndRoles[index].role = role;
    setFormValues({ ...formValues, teamAndRoles: newTeamAndRoles });
    setModified(true);
    setModifiedFlag(true);
  }

  function handleInputChange(event) {
    const { name, value } = event.target;
    setFormValues({ ...formValues, [name]: value });
    if (name === 'name') {
      setNameChanged(true);
    }
    setModified(true);
    setModifiedFlag(true);
  }

  function handleDropDownChange(selectedOption, name) {
    setFormValues({ ...formValues, [name]: selectedOption });
    setModified(true);
    setModifiedFlag(true);
  }

  const handleResetImg = () => {
    setResetImg(false);
  };

  const handleImageChange = (file: File) => {
    if (file) {
      setFormValues({ ...formValues, imageFile: file });
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => setImageUrl(reader.result as string);
    } else {
      setFormValues({ ...formValues, imageFile: null, imageUid: '' });
      setImageUrl('');
    }
    setModified(true);
    setModifiedFlag(true);
    setImageChanged(true);
  };

  function handleDeleteRolesRow(rowId) {
    const newRoles = formValues.teamAndRoles.filter(
      (item) => item.rowId != rowId
    );
    setFormValues({ ...formValues, teamAndRoles: newRoles });
    setModified(true);
    setModifiedFlag(true);
  }

  const onTabClicked = (tab) => {
    const tabs = ['BASIC', 'SKILLS', 'SOCIAL'];
    analytics.captureEvent(
      isUserProfile
        ? APP_ANALYTICS_EVENTS.SETTINGS_USER_PROFILE_EDIT_FORM
        : APP_ANALYTICS_EVENTS.SETTINGS_MEMBER_PROFILE_EDIT_FORM,
      {
        name: tabs[tab - 1],
      }
    );
    setOpenTab(tab);
  };

  useEffect(() => {
    setEmailEditStatus(false);
    const tabs = ['BASIC', 'SKILLS', 'SOCIAL'];
    analytics.captureEvent(
      isUserProfile
        ? APP_ANALYTICS_EVENTS.SETTINGS_USER_PROFILE_EDIT_FORM
        : APP_ANALYTICS_EVENTS.SETTINGS_MEMBER_PROFILE_EDIT_FORM,
      {
        name: tabs[0],
      }
    );
  }, [isUserProfile, id]);

  useEffect(() => {}, []);

  const getMemberPreferences = async () => {
    const memberPreferences = await getPreferences(id,JSON.parse(Cookies.get('authToken')));
    setFormValues({ ...formValues, preferences: (!memberPreferences?.isnull  ? memberPreferences : { ...JSON.parse(JSON.stringify(PRIVACY_CONSTANTS.DEFAULT_SETTINGS)), ...memberPreferences })});
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
      {isProfileSettings ? (
        <>
          <div className="h-full w-full">
            <div className="mx-auto mb-40 h-full">
              {
                <>
                <div className="mt-3 flex h-10 w-full w-3/5  justify-start text-slate-400">
                  <button
                    className={`w-1/4 border-b-4 border-transparent text-base font-medium ${
                      openTab == 1 ? 'border-b-[#156FF7] text-[#156FF7]' : ''
                    } ${
                      basicErrors?.length > 0 && openTab == 1
                        ? 'border-b-[#DD2C5A] text-[#DD2C5A]'
                        : basicErrors?.length > 0
                        ? 'text-[#DD2C5A]'
                        : ''
                    }`}
                    onClick={() => onTabClicked(1)}
                  >
                    {' '}
                    BASIC{' '}
                  </button>
                  <button
                    className={`w-1/4 border-b-4 border-transparent text-base font-medium ${
                      openTab == 2 ? 'border-b-[#156FF7] text-[#156FF7]' : ''
                    } ${
                      skillErrors?.length > 0 && openTab == 2
                        ? 'border-b-[#DD2C5A] text-[#DD2C5A]'
                        : skillErrors?.length > 0
                        ? 'text-[#DD2C5A]'
                        : ''
                    }`}
                    onClick={() => onTabClicked(2)}
                  >
                    {' '}
                    SKILLS
                  </button>
                  <button
                    className={`w-1/4 border-b-4 border-transparent text-base font-medium ${
                      openTab == 3 ? 'border-b-[#156FF7] text-[#156FF7]' : ''
                    }`}
                    onClick={() => onTabClicked(3)}
                  >
                    {' '}
                    EXPERIENCE{' '}
                  </button>
                  <button
                    className={`w-1/4 border-b-4 border-transparent text-base font-medium ${
                      openTab == 4 ? 'border-b-[#156FF7] text-[#156FF7]' : ''
                    }`}
                    onClick={() => onTabClicked(4)}
                  >
                    {' '}
                    SOCIAL{' '}
                  </button>
                </div>
                <div className='relative float-right text-[13px] leading-[20px] text-[#156FF7] font-medium cursor-pointer top-[-33px]' onClick={async () => {
                  await getMemberPreferences();
                  setOpenPreferenceFlag(true);
                }}>
                    {
                      !isUserProfile && (
                        <>
                          <PrefernceIcon className='inline-block' />
                          <span className='relative pl-[5px]'>{SETTINGS_CONSTANTS.VIEW_PREFERNCES}</span>
                        </>
                      )
                    }
              </div>
                <PreferenceModal isOpen={openPreference} onCloseFn={setOpenPreferenceFlag}>
                  <Privacy from={SETTINGS_CONSTANTS.VIEW_PREFERNCES} memberPreferences={formValues.preferences}/>
                  </PreferenceModal>
              </>
              }
              <div className="mt-3 w-full relative rounded-md border bg-white  px-6 py-10">
                {
                  <Fragment>
                    <div className={openTab === 1 ? 'block' : 'hidden'}>
                      <AddMemberBasicForm
                        formValues={formValues}
                        onChange={handleInputChange}
                        handleImageChange={handleImageChange}
                        imageUrl={imageUrl}
                        isEditMode={true}
                        disableEmail={true}
                        setDisableNext={setDisableSubmit}
                        resetFile={reset}
                        isEmailEditActive={isEmailEditActive}
                        onNewEmailInputChange={onNewEmailInputChange}
                        currentEmail={currentEmail}
                        onCancelEmailChange={onCancelEmailChange}
                        isUserProfile={isUserProfile}
                        isProfileSettings={isProfileSettings}
                        onEmailChange={onEmailChange}
                        resetImg={resetImg}
                        onResetImg={handleResetImg}
                        dataLoaded={dataLoaded}
                      />
                    </div>
                    <div className={openTab === 2 ? 'block' : 'hidden'}>
                      <AddMemberSkillForm
                        formValues={formValues}
                        dropDownValues={dropDownValues}
                        handleDropDownChange={handleDropDownChange}
                        handleAddNewRole={handleAddNewRole}
                        updateParentTeamValue={updateParentTeamValue}
                        updateParentRoleValue={updateParentRoleValue}
                        handleDeleteRolesRow={handleDeleteRolesRow}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div className={openTab === 3 ? 'block' : 'hidden'}>
                      <AddMemberExperience
                        formValues={formValues}
                        onChange={handleInputChange}
                        experienceErrors={expErrors}
                      />
                    </div>
                    <div className={openTab === 4 ? 'block' : 'hidden'}>
                      <AddMemberSocialForm
                        formValues={formValues}
                        onChange={handleInputChange}
                      />
                    </div>
                  </Fragment>
                }
              </div>
            </div>
            {
              <div
                className={`footerdiv flow-root w-full ${
                  isProfileSettings
                    ? 'fixed inset-x-0 bottom-0 h-[80px] bg-white'
                    : ''
                }`}
              >
                {!isProfileSettings && (
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
                      isProfileSettings,
                      disableSubmit
                    )}
                  </div>
                </div>
              </div>
            }
            {!isProfileSettings && (
              <RequestPending
                isOpen={isPendingRequestModalOpen}
                setIsModalOpen={setIsPendingRequestModalOpen}
              />
            )}
            {isProfileSettings && (
              <ValidationErrorMessages
                isOpen={isErrorPopupOpen}
                setIsModalOpen={() => {
                  setIsErrorPopupOpen(false);
                }}
                from={'member'}
                errors={{
                  basic: basicErrors,
                  skills: skillErrors,
                }}
              />
            )}
            <DiscardChangesPopup
              text={MSG_CONSTANTS.RESET_CHANGE_CONF_MSG}
              isOpen={openValidationPopup}
              onCloseFn={confirmationClose}
            />
          </div>
          {isEmailEditActive && isUserProfile && (
            <ChangeEmailModal onClose={onChangeEmailClose} />
          )}
        </>
      ) : (
        <Modal
          isOpen={isOpen}
          onClose={() => handleModalClose()}
          enableFooter={false}
          image={<TextImage />}
          modalRef={divRef}
        >
          {saveCompleted ? (
            <div>
              <div className="mb-3 text-center text-2xl font-bold">
                Your changes has been saved successfully.
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
          ) : (
            <div>
              <div className="px-8">
                <span className="font-size-14 text-sm">
                  Please fill out only the fields you would like to change for
                  this member. If there is something you want to change that is
                  not available, please leave a detailed explanation in
                  &quot;Additional Notes&quot;. If you don&apos;t want to change
                  a field, leave it blank.
                </span>
              </div>
              {errors?.length > 0 && (
                <div className="w-full rounded-lg bg-white p-5 ">
                  <ul className="list-inside list-disc space-y-1 text-xs text-red-500">
                    {errors.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="inputfield px-8 pb-10 pt-4">
                <InputField
                  required
                  name="requestorEmail"
                  type="email"
                  label="Requestor Email"
                  value={userInfo?.email}
                  onChange={handleInputChange}
                  disabled={userInfo ? true : false}
                  placeholder="Enter your email address"
                  className="custom-grey custom-outline-none border"
                />
              </div>
              <div className="overflow-y-auto px-11">
                <AddMemberBasicForm
                  formValues={formValues}
                  onChange={handleInputChange}
                  handleImageChange={handleImageChange}
                  imageUrl={imageUrl}
                  isEditMode={true}
                  setDisableNext={setDisableSubmit}
                  // emailExists={emailExists}
                  disableEmail={true}
                  isEmailEditActive={isEmailEditActive}
                  onCancelEmailChange={onCancelEmailChange}
                  isUserProfile={isUserProfile}
                  isProfileSettings={isProfileSettings}
                  onEmailChange={onEmailChange}
                />
                <AddMemberSkillForm
                  formValues={formValues}
                  dropDownValues={dropDownValues}
                  handleDropDownChange={handleDropDownChange}
                  handleAddNewRole={handleAddNewRole}
                  updateParentTeamValue={updateParentTeamValue}
                  updateParentRoleValue={updateParentRoleValue}
                  handleDeleteRolesRow={handleDeleteRolesRow}
                  onChange={handleInputChange}
                />
                <AddMemberSocialForm
                  formValues={formValues}
                  onChange={handleInputChange}
                />
              </div>
              <div className="footerdiv flow-root w-full px-8">
                <div className="float-left">
                  {getCancelOrBackButton(handleModalClose)}
                </div>
                <div className="float-right">
                  {getSubmitOrNextButton(
                    handleSubmit,
                    isProcessing,
                    isProfileSettings,
                    disableSubmit
                  )}
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
