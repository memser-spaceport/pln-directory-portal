import {
  Dispatch,
  SetStateAction,
  useState,
  ChangeEvent,
  useEffect,
} from 'react';
import AddTeamStepOne from './addteamstepone';
import AddTeamStepTwo from './addteamsteptwo';
import AddTeamStepThree from './addteamstepthree';
import Modal from '../../../components/layout/navbar/modal/modal';
import FormStepsIndicator from '../members/formstepsindicator';
import {
  fetchMembershipSources,
  fetchFundingStages,
  fetchIndustryTags,
  fetchProtocol,
} from '../../../utils/services/dropdown-service';
import axios from 'axios';

const API_URL = `http://localhost:3001`;

interface AddTeamModalProps {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
}

export interface FormValues {
  name: string;
  email: string;
  image: string;
  description: string;
  longDescription: string;
  protocol: string;
  fundingStage: string;
  membershipSource: string;
  industryTags: [];
  contactMethod: string;
  website: string;
  linkedinURL: string;
  twitterHandle: string;
  blog: string;
  officeHoursLink: string;
}

const teamFormSteps = [
  { number: 1, name: 'BASIC' },
  { number: 2, name: 'PROJECT DETAILS' },
  { number: 3, name: 'SOCIAL' },
];

function validateBasicForm(formValues) {
  const errors = [];
  if (!formValues.name) {
    errors.push('Please add Team Name.');
  }
  if (!formValues.description) {
    errors.push('Please add Description.');
  }
  if (!formValues.longDescription) {
    errors.push('Please add Long Description.');
  }
  return errors;
}

function validateProjectDetailForm(formValues) {
  const errors = [];
  if (!formValues.fundingStage.length) {
    errors.push('Please add Funding Stage');
  }
  if (!formValues.industryTags.length) {
    errors.push('Please add IndustryTags');
  }
  return errors;
}

function validateSocialForm(formValues) {
  const errors = [];
  if (!formValues.contactMethod) {
    errors.push('Please add Preferred method of contact');
  }
  if (!formValues.website) {
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

export function AddTeamModal({ isOpen, setIsModalOpen }: AddTeamModalProps) {
  const [formStep, setFormStep] = useState<number>(1);
  const [errors, setErrors] = useState([]);
  const [dropDownValues, setDropDownValues] = useState({});
  const [formValues, setFormValues] = useState<FormValues>({
    name: '',
    email: '',
    image: '',
    description: '',
    longDescription: '',
    protocol: '',
    fundingStage: '',
    membershipSource: '',
    industryTags: [],
    contactMethod: '',
    website: '',
    linkedinURL: '',
    twitterHandle: '',
    blog: '',
    officeHoursLink: '',
  });

  useEffect(() => {
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
      .catch((e) => console.error(e));
  }, []);

  async function handleSubmit() {
    console.log('formValues', formValues);
    axios
      .get(`${API_URL}/token`)
      .then((response) => {
        console.log('token', response?.data);
        if (response.data) {
          const options = {
            method: 'POST',
            url: `${API_URL}/participants-request`,
            headers: {
              'content-type': 'application/json',
              'csrf-token': response.data,
            },
            data: [
              {
                participantType: 'TEAM',
                status: 'PENDING',
                requesterEmail: formValues.email,
                newData: { ...formValues },
              },
            ],
          };
          axios.request(options).then((response) => {
            console.log(response.data);
            setIsModalOpen(false);
            setFormValues({
              name: '',
              email: '',
              image: '',
              description: '',
              longDescription: '',
              protocol: '',
              fundingStage: '',
              membershipSource: '',
              industryTags: [],
              contactMethod: '',
              website: '',
              linkedinURL: '',
              twitterHandle: '',
              blog: '',
              officeHoursLink: '',
            });
          });
        }
      })
      .catch(function (error) {
        console.error(error);
      });
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

  function getFormStep() {
    switch (formStep) {
      case 1:
        return (
          <AddTeamStepOne
            formValues={formValues}
            handleInputChange={handleInputChange}
            handleDropDownChange={handleDropDownChange}
          />
        );
      case 2:
        return (
          <AddTeamStepTwo
            formValues={formValues}
            dropDownValues={dropDownValues}
            handleInputChange={handleInputChange}
            handleDropDownChange={handleDropDownChange}
          />
        );
      case 3:
        return (
          <AddTeamStepThree
            formValues={formValues}
            handleInputChange={handleInputChange}
            handleDropDownChange={handleDropDownChange}
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

  return (
    <>
      <Modal
        isOpen={isOpen}
        setIsOpen={setIsModalOpen}
        enableFooter={false}
        image="/assets/images/join_as_a_member.jpg"
      >
        <FormStepsIndicator formStep={formStep} steps={teamFormSteps} />
        {errors?.length > 0 && (
          <div className="w-full rounded-lg border border-gray-200 bg-white p-10 shadow hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700">
            <ul className="list-inside list-disc space-y-1 text-red-500 dark:text-gray-400">
              {errors.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="overflow-y-auto">{getFormStep()}</div>
        <div className="bottom flow-root">
          <div className="float-left m-2">
            {getCancelOrBackButton(formStep, setIsModalOpen, setFormStep)}
          </div>
          <div className="float-right m-2">
            {getSubmitOrNextButton(
              formValues,
              formStep,
              setFormStep,
              handleSubmit,
              setErrors
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
