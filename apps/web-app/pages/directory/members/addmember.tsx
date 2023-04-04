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
import FormStepsIndicator from './formstepsindicator';
import { FormValues } from './member.types';
import Modal from '../../../components/layout/navbar/modal/modal';
import {
  fetchSkills,
  fetchTeams,
} from '../../../utils/services/dropdown-service';
import axios from 'axios';

const API_URL = `http://localhost:3001`;

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
  if (!formValues.name) {
    errors.push('Name is required.');
  }
  if (!formValues.email) {
    errors.push('Email field is required.');
  }
  return errors;
}

function validateSkillForm(formValues) {
  const errors = [];
  if (!formValues.teamAndRoles.length) {
    errors.push('please add your team and role details');
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

function getCancelOrBackButton(formStep, setIsModalOpen, setFormStep) {
  const cancelorBackButton =
    formStep === 1 ? (
      <button
        className="on-focus leading-3.5 text-md mr-2 mb-2 rounded-full border border-slate-300 px-5 py-3 text-left font-medium last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full"
        onClick={() => setIsModalOpen(false)}
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
  const [formValues, setFormValues] = useState<FormValues>({
    name: '',
    email: '',
    image: '',
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
    Promise.all([fetchSkills(), fetchTeams()])
      .then((allData) =>
        setDropDownValues({ skillValues: allData[0], teamNames: allData[1] })
      )
      .catch((e) => console.error(e));
  }, []);

  function formatData() {
    // const formattedSkills = formValues.skills.map(item=>{
    //   return {uid: item.value, title: item.label}
    // })
    const formattedTeamAndRoles = formValues.teamAndRoles.map((item) => {
      delete item.rowId;
      return item;
    });
    setFormValues({ ...formValues, teamAndRoles: formattedTeamAndRoles });
  }

  async function handleSubmit() {
    formatData();
    try {
      console.log('formValues', formValues);
      const token = await axios
        .get(`${API_URL}/token`, { withCredentials: true })
        .then((res) => {
          // console.log('response', res.headers, res.headers.get('set-cookie'));
          return res?.data.token;
        });
      console.log('token', token);

      const data = {
        participantType: 'MEMBER',
        status: 'PENDING',
        newData: { ...formValues },
      };
      await axios
        .post(`${API_URL}/participants-request`, data, {
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': token,
            // cookie: 'UHaLU99nOgBFBs2g5Iamyw',
          },
        })
        .then((response) => {
          setIsModalOpen(false);
          setFormValues({
            name: '',
            email: '',
            image: '',
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
        setIsOpen={setIsModalOpen}
        enableFooter={false}
        image="/assets/images/join_as_a_member.jpg"
      >
        <div className="">
          <FormStepsIndicator formStep={formStep} steps={steps} />
          {errors?.length > 0 && (
            <div className="w-full rounded-lg border border-gray-200 bg-white p-10 shadow hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700">
              <ul className="list-inside list-disc space-y-1 text-red-500 dark:text-gray-400">
                {errors.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="">{getFormWithStep()}</div>
          <div className="absolute bottom-3 flow-root w-full px-8 py-2">
            <div className="float-left">
              {getCancelOrBackButton(formStep, setIsModalOpen, setFormStep)}
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
      </Modal>
    </>
  );
}
