import {
  Dispatch,
  SetStateAction,
  useState,
  ChangeEvent,
  useEffect,
  useCallback,
} from 'react';
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
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';

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
  console.log('formValues>>>>', formValues);
  const errors = [];
  if (!formValues.name) {
    errors.push('Please add Team Name.');
  }
  if (!formValues.shortDescription) {
    errors.push('Please add Description.');
  }
  if (!formValues.longDescription) {
    errors.push('Please add Long Description.');
  }
  if (!formValues.officeHours) {
    errors.push('Please add Office Hours.');
  }
  return errors;
}

function validateProjectDetailForm(formValues) {
  const errors = [];
  if (!formValues.fundingStage) {
    errors.push('Please add Funding Stage');
  }
  if (!formValues.industryTags.length) {
    errors.push('Please add IndustryTags');
  }
  return errors;
}

function validateSocialForm(formValues) {
  console.log('validateSocialForm>>>', formValues);
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
  console.log('errors>>>>', errors);
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

export function AddTeamModal({ isOpen, setIsModalOpen }: AddTeamModalProps) {
  const [formStep, setFormStep] = useState<number>(1);
  const [errors, setErrors] = useState([]);
  const [imageUrl, setImageUrl] = useState<string>();
  const [saveCompleted, setSaveCompleted] = useState<boolean>(false);
  const [dropDownValues, setDropDownValues] = useState({});
  const [formValues, setFormValues] = useState<IFormValues>({
    name: '',
    logoUid: '',
    logoFile: null,
    shortDescription: '',
    longDescription: '',
    technologies: [],
    fundingStage: {},
    membershipSource: [],
    industryTags: [],
    contactMethod: '',
    website: '',
    linkedinHandler: '',
    twitterHandle: '',
    blog: '',
    officeHours: '',
  });

  const { executeRecaptcha } = useGoogleReCaptcha();

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
        .catch((e) => console.error(e));
    }
  }, [isOpen]);

  function resetState() {
    setFormStep(1);
    setErrors([]);
    setDropDownValues({});
    setSaveCompleted(false);
    setFormValues({
      name: '',
      logoUid: '',
      logoFile: null,
      shortDescription: '',
      longDescription: '',
      technologies: [],
      fundingStage: {},
      membershipSource: [],
      industryTags: [],
      contactMethod: '',
      website: '',
      linkedinHandler: '',
      twitterHandle: '',
      blog: '',
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
    const formattedMembershipSource = formValues.membershipSource.map(
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

    setFormValues({
      ...formValues,
      fundingStage: formattedFundingStage,
      industryTags: formattedTags,
      membershipSource: formattedMembershipSource,
      technologies: formattedtechnologies,
    });
  }

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      if (!executeRecaptcha) {
        console.log('Execute recaptcha not yet available');
        return;
      }
      formatData();
      console.log('formValues', formValues);
      try {
        const captchaToken = await executeRecaptcha();

        if (!captchaToken) return;
        let image;
        if (formValues.logoFile) {
          const formData = new FormData();
          formData.append('file', formValues.logoFile);
          const config = {
            headers: {
              'content-type': 'multipart/form-data',
            },
          };
          image = api.post(`/v1/images`, formData, config).then((response) => {
            return response?.data?.image;
          });
        }
        const data = {
          participantType: 'TEAM',
          status: 'PENDING',
          newData: { ...formValues, logoUid: image?.uid },
          captchaToken
        };
        await api.post(`/v1/participants-request`, data).then((response) => {
          setSaveCompleted(true);
        });
      } catch (err) {
        console.log('error', err);
      }
    },
    [executeRecaptcha]
  );

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;
    setFormValues({ ...formValues, [name]: value });
  }

  const handleImageChange = (file: File) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => setImageUrl(reader.result as string);
    setFormValues({ ...formValues, logoFile: file });
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
            imageUrl={imageUrl}
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
        onClose={handleModalClose}
        enableFooter={false}
        image="/assets/images/join_as_a_member.jpg"
      >
        {saveCompleted ? (
          <div>
            <span className="text-lg">Thank you for submitting</span>
            <span className="text-md">
              Our team will review your request shortly & get back
            </span>
            <div>
              <button
                className="shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-full justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]"
                onClick={() => handleModalClose()}
              >
                Return to home
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
            <div className="px-3">{getFormStep()}</div>
            <div className="footerdiv flow-root w-full px-8 ">
              <div className="float-left m-2">
                {getCancelOrBackButton(formStep, handleModalClose, setFormStep)}
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
          </div>
        )}
      </Modal>
    </>
  );
}
