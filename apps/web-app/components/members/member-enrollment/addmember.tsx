import {
  Dispatch,
  SetStateAction,
  useState,
  useEffect,
  ChangeEvent,
  useCallback,
  useRef,
} from 'react';
import { trackGoal } from 'fathom-client';
import AddMemberBasicForm from './addmemberbasicform';
import AddMemberSkillForm from './addmemberskillform';
import AddMemberSocialForm from './addmembersocialform';
import FormStepsIndicator from '../../shared/step-indicator/step-indicator';
import { IFormValues } from '../../../utils/members.types';
import Modal from '../../layout/navbar/modal/modal';
import {
  fetchSkills,
  fetchTeams,
} from '../../../utils/services/dropdown-service';

import api from '../../../utils/api';
import {
  APP_ANALYTICS_EVENTS,
  ENROLLMENT_TYPE,
  FATHOM_EVENTS,
} from '../../../constants';
import { ReactComponent as TextImage } from '/public/assets/images/create_member.svg';
import { LoadingIndicator } from '../../shared/loading-indicator/loading-indicator';
import { toast } from 'react-toastify';
import useAppAnalytics from '../../../hooks/shared/use-app-analytics';
import ProjectContribution from '../../projects/contribution/project-contribution';
import { ModalHeader } from '../../shared/modal-header/modal-header';
// import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';

interface AddMemberModalProps {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
}

const steps = [
  { number: 1, name: 'BASIC' },
  { number: 2, name: 'SKILL' },
  { number: 3, name: 'CONTRIBUTIONS' },
  { number: 4, name: 'SOCIAL' },
];

function validateBasicForm(formValues) {
  const errors = [];
  const emailRE =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (!formValues.name.trim()) {
    errors.push('Please add your Name');
  }
  if (!formValues.email.trim() || !formValues.email?.trim().match(emailRE)) {
    errors.push('Please add valid Email');
  }
  return errors;
}

function validateSkillForm(formValues) {
  const errors = [];
  if (!formValues.teamAndRoles.length) {
    errors.push('Please add your Team and Role details');
  } else {
    const missingValues = formValues.teamAndRoles.filter(
      (item) => item.teamUid == '' || item.role.trim() == ''
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

function validateContributionForm(fValues) {
  const formErrors = [];
  const exps = fValues.projectContributions;
  exps.forEach((exp, expIndex) => {
    if (exp.projectName.trim() === '') {
      formErrors.push({
        id: expIndex,
        field: 'projectName',
        error: 'Project name is mandatory',
      });
    }
    if (exp.role.trim() === '') {
      formErrors.push({
        id: expIndex,
        field: 'role',
        error: 'Role is Mandatory',
      });
    }
    if (exp.startDate && exp.startDate.getTime() >= new Date().getTime()) {
      formErrors.push({
        id: expIndex,
        name: `Project ${exp.projectName ? exp.projectName : expIndex + 1}`,
        field: 'date',
        error: 'Your contribution cannot start from a future date',
      });
    }
    if (exp.endDate && exp.endDate.getTime() >= new Date().getTime()) {
      formErrors.push({
        id: expIndex,
        name: `Project ${exp.projectName ? exp.projectName : expIndex + 1}`,
        field: 'date',
        error: 'Your contribution cannot end in a future date',
      });
    }
    if (exp.endDate && exp.startDate.getTime() >= exp.endDate.getTime()) {
      formErrors.push({
        id: expIndex,
        field: 'date',
        error:
          'Your contribution end date cannot be less than or equal to start date',
      });
    }
  });

  return formErrors;
}

function validateForm(formValues, formStep) {
  let errors = [];
  switch (formStep) {
    case 1:
      errors = validateBasicForm(formValues);
      return errors;
    case 2:
      errors = validateSkillForm(formValues);
      return errors;
    case 3:
      errors = validateContributionForm(formValues);
      return errors;
  }
}

function handleNextClick(
  formValues,
  formStep,
  setFormStep,
  setErrors,
  setContributionErrors,
  emailExists,
  divRef,
  analytics
) {
  const errors = validateForm(formValues, formStep);
  const element1 = divRef.current;
  if (element1) {
    element1.scrollTo({ top: 0, behavior: 'smooth' });
    // element1.scrollTop = 0;
  }
  if (errors?.length > 0 || emailExists) {
    if (formStep === 3) {
      setContributionErrors(errors);
      setErrors([
        'There are fields that require your attention. Please review the fields below.',
      ]);
      return false;
    } else {
      setErrors(errors);
      return false;
    }
  }
  setContributionErrors([]);
  analytics.captureEvent(APP_ANALYTICS_EVENTS.MEMBER_JOIN_NETWORK_FORM_STEPS, {
    itemName: steps[formStep - 1].name,
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
  setContributionErrors,
  isProcessing,
  emailExists,
  disableNext,
  divRef,
  analytics
) {
  const buttonClassName =
    'shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-full justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8] disabled:bg-slate-400';
  const submitOrNextButton =
    formStep === 4 ? (
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
            setContributionErrors,
            emailExists,
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

export function AddMemberModal({
  isOpen,
  setIsModalOpen,
}: AddMemberModalProps) {
  const [formStep, setFormStep] = useState<number>(1);
  const [errors, setErrors] = useState([]);
  const [contributionErrors, setContributionErrors] = useState([]);
  const [dropDownValues, setDropDownValues] = useState({});
  const [emailExists, setEmailExists] = useState<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string>();
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [saveCompleted, setSaveCompleted] = useState<boolean>(false);
  const [disableNext, setDisableNext] = useState<boolean>(false);
  const [formValues, setFormValues] = useState<IFormValues>({
    name: '',
    email: '',
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
    projectContributions: [],
    openToWork: false,
  });

  const divRef = useRef<HTMLDivElement>(null);
  // const { executeRecaptcha } = useGoogleReCaptcha();
  const analytics = useAppAnalytics();

  useEffect(() => {
    if (isOpen) {
      Promise.all([fetchSkills(), fetchTeams()])
        .then((allData) =>
          setDropDownValues({ skillValues: allData[0], teamNames: allData[1] })
        )
        .catch((err) => {
          toast(err?.message);
        });
    }
  }, [isOpen]);

  function resetState() {
    setFormStep(1);
    setErrors([]);
    setEmailExists(false);
    setDropDownValues({});
    setSaveCompleted(false);
    setImageUrl('');
    setDisableNext(false);
    setIsProcessing(false);
    setFormValues({
      name: '',
      email: '',
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
      projectContributions: [],
      openToWork: false,
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
    const formattedTeamAndRoles = formValues.teamAndRoles.map((item) => {
      delete item.rowId;
      return item;
    });
    const skills = formValues.skills.map((item) => {
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
      teamAndRoles: formattedTeamAndRoles,
      openToWork: formValues.openToWork,
    };
    return formattedData;
  }

  function onEmailBlur(event: ChangeEvent<HTMLInputElement>) {
    const data = {
      uniqueIdentifier: event.target.value?.toLowerCase().trim(),
      participantType: ENROLLMENT_TYPE.MEMBER,
    };
    api
      .post(`/v1/participants-request/unique-identifier`, data)
      .then((response) => {
        setDisableNext(false);
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
      // if (!executeRecaptcha) {
      //   console.log('Execute recaptcha not yet available');
      //   return;
      // }
      analytics.captureEvent(
        APP_ANALYTICS_EVENTS.MEMBER_JOIN_NETWORK_FORM_STEPS,
        {
          itemName: 'SOCIAL',
        }
      );
      const values = formatData();
      values.projectContributions = [...values.projectContributions].map(
        (v) => {
          delete v.projectName;
          delete v.projectLogo;
          delete v.project;
          return v;
        }
      );
      try {
        // const captchaToken = await executeRecaptcha();

        // if (!captchaToken) return;
        let image;
        setIsProcessing(true);
        if (values.imageFile) {
          const formData = new FormData();
          formData.append('file', values.imageFile);
          const config = {
            headers: {
              'content-type': 'multipart/form-data',
            },
          };
          const imageResponse = await api.post(`/v1/images`, formData, config);
          image = imageResponse?.data?.image;
        }

        const data = {
          participantType: ENROLLMENT_TYPE.MEMBER,
          status: 'PENDING',
          requesterEmailId: values.email,
          uniqueIdentifier: values.email,
          newData: { ...values, imageUid: image?.uid, imageUrl: image?.url },
          // captchaToken,
        };
        const response = await api.post(`/v1/participants-request`, data);
        // if (
        //   typeof document !== 'undefined' &&
        //   document.getElementsByClassName('grecaptcha-badge').length
        // ) {
        //   document
        //     .getElementsByClassName('grecaptcha-badge')[0]
        //     .classList.add('w-0');
        // }
        trackGoal(FATHOM_EVENTS.directory.joinNetworkAsMemberSave, 0);
        analytics.captureEvent(
          APP_ANALYTICS_EVENTS.MEMBER_JOIN_NETWORK_FORM_STEPS,
          {
            itemName: 'COMPLETED',
          }
        );
        setSaveCompleted(true);
      } catch (err) {
        if (err.response.status === 400) {
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

  function handleAddNewRole() {
    const newRoles = formValues.teamAndRoles;
    const counter =
      newRoles.length == 0
        ? 1
        : Math.max(...newRoles.map((item) => item.rowId + 1));
    newRoles.push({ teamUid: '', teamTitle: '', role: '', rowId: counter });
    setFormValues({ ...formValues, teamAndRoles: newRoles });
  }

  function updateParentTeamValue(teamUid, teamTitle, rowId) {
    const newTeamAndRoles = formValues.teamAndRoles;
    const index = newTeamAndRoles.findIndex((item) => item.rowId == rowId);
    newTeamAndRoles[index].teamUid = teamUid;
    newTeamAndRoles[index].teamTitle = teamTitle;
    setFormValues({ ...formValues, teamAndRoles: newTeamAndRoles });
  }

  function updateParentRoleValue(role, rowId) {
    const newTeamAndRoles = formValues.teamAndRoles;
    const index = newTeamAndRoles.findIndex((item) => item.rowId == rowId);
    newTeamAndRoles[index].role = role;
    setFormValues({ ...formValues, teamAndRoles: newTeamAndRoles });
  }

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;
    setFormValues({ ...formValues, [name]: value });
  }

  function handleDropDownChange(selectedOption, name) {
    setFormValues({ ...formValues, [name]: selectedOption });
  }

  const handleImageChange = (file: File | null) => {
    if (file) {
      setFormValues({ ...formValues, imageFile: file });
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => setImageUrl(reader.result as string);
    } else {
      setFormValues({ ...formValues, imageFile: null, imageUid: '' });
      setImageUrl('');
    }
  };

  function handleDeleteRolesRow(rowId) {
    const newRoles = formValues.teamAndRoles.filter(
      (item) => item.rowId != rowId
    );
    setFormValues({ ...formValues, teamAndRoles: newRoles });
  }

  function getFormWithStep() {
    switch (formStep) {
      case 1:
        return (
          <AddMemberBasicForm
            formValues={formValues}
            onChange={handleInputChange}
            handleImageChange={handleImageChange}
            imageUrl={imageUrl}
            emailExists={emailExists}
            onEmailBlur={onEmailBlur}
            setDisableNext={setDisableNext}
          />
        );
      case 2:
        return (
          <AddMemberSkillForm
            formValues={formValues}
            dropDownValues={dropDownValues}
            handleDropDownChange={handleDropDownChange}
            handleAddNewRole={handleAddNewRole}
            updateParentTeamValue={updateParentTeamValue}
            updateParentRoleValue={updateParentRoleValue}
            handleDeleteRolesRow={handleDeleteRolesRow}
            onChange={handleInputChange}
            isNewMode={true}
          />
        );
      case 3:
        return (
          <ProjectContribution
            formValues={formValues}
            onChange={handleInputChange}
            contributionErrors={contributionErrors}
            setContributionErrors={setContributionErrors}
          />
        );
      case 4:
        return (
          <AddMemberSocialForm
            formValues={formValues}
            onChange={handleInputChange}
          />
        );
      default:
        return (
          <AddMemberBasicForm
            formValues={formValues}
            onChange={handleInputChange}
          />
        );
    }
  }

  return (
    <>
      {isProcessing && (
        <div
          className={`fixed inset-0 z-[3000] flex h-screen w-screen items-center justify-center bg-gray-500 bg-opacity-75 outline-none transition-opacity`}
        >
          <LoadingIndicator />
        </div>
      )}
      <Modal
        isOpen={isOpen}
        onClose={() => handleModalClose()}
        enableFooter={false}
        image={<TextImage />}
        modalClassName={isProcessing ? 'z-[49]' : ''}
        modalRef={divRef}
      >
        <div className="w-[500px] rounded-lg bg-white">
          <ModalHeader onClose={handleModalClose} image={<TextImage />} />
          <div className="mt-40">
            {saveCompleted ? (
              <div className="px-5">
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
                <FormStepsIndicator formStep={formStep} steps={steps} />
                {errors?.length > 0 && (
                  <div className="w-full rounded-lg bg-white p-5 ">
                    <ul className="list-inside list-disc space-y-1 text-xs text-red-500">
                      {errors.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="px-11">{getFormWithStep()}</div>
                <div className={`footerdiv flow-root w-full`}>
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
                      setContributionErrors,
                      isProcessing,
                      emailExists,
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