import {
  Dispatch,
  SetStateAction,
  useState,
  useEffect,
  ChangeEvent,
  useCallback,
} from 'react';
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
import { ENROLLMENT_TYPE } from '../../../constants';
import { ReactComponent as TextImage } from '/public/assets/images/create-member.svg';
import { LoadingIndicator } from '../../shared/loading-indicator/loading-indicator';
// import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';

interface AddMemberModalProps {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
}

const steps = [
  { number: 1, name: 'BASIC' },
  { number: 2, name: 'SKILL' },
  { number: 3, name: 'SOCIAL' },
];

function validateBasicForm(formValues) {
  const errors = [];
  const emailRE =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (!formValues.name.trim()) {
    errors.push('Please add your Name');
  }
  if (!formValues.email.trim() || !formValues.email?.match(emailRE)) {
    errors.push('Please add valid Email');
  }
  if (!formValues.imageFile) {
    errors.push('Please upload a profile image');
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

function validateForm(formValues, formStep) {
  let errors = [];

  switch (formStep) {
    case 1:
      errors = validateBasicForm(formValues);
      return errors;
    case 2:
      errors = validateSkillForm(formValues);
      return errors;
  }
}

function handleNextClick(
  formValues,
  formStep,
  setFormStep,
  setErrors,
  emailExists
) {
  const errors = validateForm(formValues, formStep);
  if (errors?.length > 0 || emailExists) {
    setErrors(errors);
    return false;
  }
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
  emailExists
) {
  const buttonClassName =
    'shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-full justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]';
  const submitOrNextButton =
    formStep === 3 ? (
      <button
        className={buttonClassName}
        disabled={isProcessing}
        onClick={handleSubmit}
      >
        Add to Network
      </button>
    ) : (
      <button
        className={buttonClassName}
        onClick={() =>
          handleNextClick(
            formValues,
            formStep,
            setFormStep,
            setErrors,
            emailExists
          )
        }
      >
        Next
      </button>
    );
  return submitOrNextButton;
}

function getCancelOrBackButton(formStep, handleModalClose, setFormStep) {
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
        onClick={() => setFormStep(--formStep)}
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
  const [dropDownValues, setDropDownValues] = useState({});
  const [emailExists, setEmailExists] = useState<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string>();
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [saveCompleted, setSaveCompleted] = useState<boolean>(false);
  const [formValues, setFormValues] = useState<IFormValues>({
    name: '',
    email: '',
    imageUid: '',
    imageFile: null,
    plnStartDate: new Date().toLocaleDateString('af-ZA'),
    city: '',
    region: '',
    country: '',
    linkedinHandler: '',
    discordHandler: '',
    twitterHandler: '',
    githubHandler: '',
    officeHours: '',
    comments: '',
    teamAndRoles: [{ teamUid: '', teamTitle: '', role: '', rowId: 1 }],
    skills: [],
  });

  // const { executeRecaptcha } = useGoogleReCaptcha();

  useEffect(() => {
    if (isOpen) {
      Promise.all([fetchSkills(), fetchTeams()])
        .then((allData) =>
          setDropDownValues({ skillValues: allData[0], teamNames: allData[1] })
        )
        .catch((e) => console.error(e));
    }
  }, [isOpen]);

  function resetState() {
    setFormStep(1);
    setErrors([]);
    setDropDownValues({});
    setSaveCompleted(false);
    setImageUrl('');
    setIsProcessing(false);
    setFormValues({
      name: '',
      email: '',
      imageUid: '',
      imageFile: null,
      plnStartDate: new Date().toLocaleDateString('af-ZA'),
      city: '',
      region: '',
      country: '',
      linkedinHandler: '',
      discordHandler: '',
      twitterHandler: '',
      githubHandler: '',
      officeHours: '',
      comments: '',
      teamAndRoles: [{ teamUid: '', teamTitle: '', role: '', rowId: 1 }],
      skills: [],
    });
  }

  function handleModalClose() {
    if (
      typeof document !== 'undefined' &&
      document.getElementsByClassName('grecaptcha-badge').length
    ) {
      document
        .getElementsByClassName('grecaptcha-badge')[0]
        .classList.remove('width-full');
    }
    resetState();
    setIsModalOpen(false);
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
      name: formValues.name.trim(),
      email: formValues.email.trim(),
      city: formValues.city?.trim(),
      region: formValues.region?.trim(),
      country: formValues.country?.trim(),
      linkedinHandler: formValues.linkedinHandler?.trim(),
      discordHandler: formValues.discordHandler?.trim(),
      twitterHandler: formValues.twitterHandler?.trim(),
      githubHandler: formValues.githubHandler?.trim(),
      officeHours: formValues.officeHours?.trim(),
      comments: formValues.comments?.trim(),
      plnStartDate: new Date(formValues.plnStartDate)?.toISOString(),
      skills: skills,
      teamAndRoles: formattedTeamAndRoles,
    };
    return formattedData;
  }

  function onEmailBlur(event: ChangeEvent<HTMLInputElement>) {
    const data = {
      uniqueIdentifier: event.target.value,
      participantType: ENROLLMENT_TYPE.MEMBER,
    };
    api
      .post(`/v1/participants-request/unique-identifier`, data)
      .then((response) => {
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
      const values = formatData();
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
          image = await api
            .post(`/v1/images`, formData, config)
            .then((response) => {
              delete values.imageFile;
              return response?.data?.image;
            });
        }

        const data = {
          participantType: ENROLLMENT_TYPE.MEMBER,
          status: 'PENDING',
          requesterEmailId: values.email,
          uniqueIdentifier: values.email,
          newData: { ...values, imageUid: image?.uid, imageUrl: image?.url },
          // captchaToken,
        };
        await api.post(`/v1/participants-request`, data).then((response) => {
          if (
            typeof document !== 'undefined' &&
            document.getElementsByClassName('grecaptcha-badge').length
          ) {
            document
              .getElementsByClassName('grecaptcha-badge')[0]
              .classList.add('w-0');
          }
          setSaveCompleted(true);
        });
      } catch (err) {
        console.log('error', err);
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

  const handleImageChange = (file: File) => {
    const imageFile = file;
    setFormValues({ ...formValues, imageFile: imageFile });
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => setImageUrl(reader.result as string);
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
          />
        );
      case 3:
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
      <Modal
        isOpen={isOpen}
        onClose={() => handleModalClose()}
        enableFooter={false}
        image={<TextImage />}
      >
        {isProcessing && (
          <div
            className={`visible absolute left-0 top-0 z-[2000] flex h-full w-full items-center justify-center overflow-x-hidden overscroll-none bg-slate-100/50 opacity-100 transition-[visibility,_opacity] delay-[0s,0s] duration-[0s,_300ms] ease-[linear,_linear]`}
          >
            <LoadingIndicator />
          </div>
        )}
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
                Return to home
              </button>
            </div>
          </div>
        ) : (
          <div className="">
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
                {getCancelOrBackButton(formStep, handleModalClose, setFormStep)}
              </div>
              <div className="float-right">
                {getSubmitOrNextButton(
                  formValues,
                  formStep,
                  setFormStep,
                  handleSubmit,
                  setErrors,
                  isProcessing,
                  emailExists
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
