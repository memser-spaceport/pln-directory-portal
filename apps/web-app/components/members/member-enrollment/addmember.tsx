import {
  Dispatch,
  SetStateAction,
  useState,
  useEffect,
  ChangeEvent,
} from 'react';
import moment from 'moment';
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
  if (!formValues.name) {
    errors.push('Name is a mandatory.');
  }
  if (!formValues.email || !formValues.email?.match(emailRE)) {
    errors.push('Email is mandatory.');
  }
  return errors;
}

function validateSkillForm(formValues) {
  const errors = [];
  if (!formValues.teamAndRoles.length) {
    errors.push('Please add your Team and Role details');
  } else {
    const missingValues = formValues.teamAndRoles.filter(
      (item) => item.teamUid == '' || item.role == ''
    );
    if (missingValues.length) {
      errors.push('Team or Role value is missing');
    }
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

function handleNextClick(formValues, formStep, setFormStep, setErrors) {
  const errors = validateForm(formValues, formStep);
  if (errors?.length > 0) {
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
  setErrors
) {
  const buttonClassName =
    'shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-full justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]';
  const submitOrNextButton =
    formStep === 3 ? (
      <button className={buttonClassName} onClick={handleSubmit}>
        Add to Network
      </button>
    ) : (
      <button
        className={buttonClassName}
        onClick={() =>
          handleNextClick(formValues, formStep, setFormStep, setErrors)
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
        className="on-focus leading-3.5 text-md mr-2 mb-2 rounded-full border border-slate-300 px-5 py-3 text-left font-medium last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full"
        onClick={() => handleModalClose()}
      >
        Cancel
      </button>
    ) : (
      <button
        className="on-focus leading-3.5 text-md mr-2 mb-2 rounded-full border border-slate-300 px-5 py-3 text-left font-medium last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full"
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
  const [imageUrl, setImageUrl] = useState<string>();
  const [saveCompleted, setSaveCompleted] = useState<boolean>(false);
  const [formValues, setFormValues] = useState<IFormValues>({
    name: '',
    email: '',
    imageUid: '',
    imageFile: null,
    plnStartDate: moment(new Date()).format('DD/MM/YYYY'),
    city: '',
    region: '',
    country: '',
    linkedinURL: '',
    discordHandler: '',
    twitterHandler: '',
    githubHandler: '',
    officeHours: '',
    comments: '',
    teamAndRoles: [],
    skills: [],
  });

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
    setFormValues({
      name: '',
      email: '',
      imageUid: '',
      imageFile: null,
      plnStartDate: moment(new Date()).format('DD/MM/YYYY'),
      city: '',
      region: '',
      country: '',
      linkedinURL: '',
      discordHandler: '',
      twitterHandler: '',
      githubHandler: '',
      officeHours: '',
      comments: '',
      teamAndRoles: [],
      skills: [],
    });
  }

  function handleModalClose() {
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
    setFormValues({
      ...formValues,
      skills: skills,
      teamAndRoles: formattedTeamAndRoles,
    });
  }

  async function handleSubmit() {
    formatData();
    try {
      let image;
      if(formValues.imageFile){
        image = await api
        .post(`/v1/images`, formValues.imageFile)
        .then((response) => {
          return response?.data?.image;
        });
      }

      const data = {
        participantType: 'MEMBER',
        status: 'PENDING',
        newData: { ...formValues, imageUid: image?.uid },
      };
      await api.post(`/v1/participants-request`, data).then((response) => {
        console.log('response', response);
        setSaveCompleted(true);
      });
    } catch (err) {
      console.log('error', err);
    }
  }

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
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => setImageUrl(reader.result as string);
    setFormValues({ ...formValues, imageFile: file });
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
        image="/assets/images/join_as_a_member.jpg"
      >
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
            <div className="px-3">{getFormWithStep()}</div>
            <div
              className={`footerdiv flow-root w-full px-8 formStep${formStep}`}
            >
              <div className="float-left">
                {getCancelOrBackButton(formStep, handleModalClose, setFormStep)}
              </div>
              <div className="float-right">
                {getSubmitOrNextButton(
                  formValues,
                  formStep,
                  setFormStep,
                  handleSubmit,
                  setErrors
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
