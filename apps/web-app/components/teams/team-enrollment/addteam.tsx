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
import { ENROLLMENT_TYPE } from '../../../constants';
import { ReactComponent as TextImage } from '/public/assets/images/create-team.svg';
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
  const errors = [];
  const emailRE =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (
    !formValues.requestorEmail?.trim() ||
    !formValues.requestorEmail?.match(emailRE)
  ) {
    errors.push('Please add valid Requestor email.');
  }
  if (!formValues.name.trim()) {
    errors.push('Please add Team Name.');
  }
  if (!formValues.logoFile) {
    errors.push('Please add logo.');
  }
  if (!formValues.shortDescription?.trim()) {
    errors.push('Please add Description.');
  }
  if (!formValues.longDescription?.trim()) {
    errors.push('Please add Long Description.');
  }
  return errors;
}

function validateProjectDetailForm(formValues) {
  const errors = [];
  if (!formValues.fundingStage?.value) {
    errors.push('Please add Funding Stage');
  }
  if (!formValues.membershipSources.length) {
    errors.push('Please add Membership Source');
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
  nameExists
) {
  const errors = validateForm(formValues, formStep);
  if (errors?.length > 0 || nameExists) {
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
  nameExists
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
            nameExists
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

export function AddTeamModal({ isOpen, setIsModalOpen }: AddTeamModalProps) {
  const [formStep, setFormStep] = useState<number>(1);
  const [errors, setErrors] = useState([]);
  const [nameExists, setNameExists] = useState<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [saveCompleted, setSaveCompleted] = useState<boolean>(false);
  const [dropDownValues, setDropDownValues] = useState({});
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
    setImageUrl('');
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
      blog: '',
      officeHours: '',
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
      name: formValues.name?.trim(),
      shortDescription: formValues.shortDescription?.trim(),
      longDescription: formValues.longDescription?.trim(),
      website: formValues.website?.trim(),
      twitterHandler: formValues.twitterHandler?.trim(),
      linkedinHandler: formValues.linkedinHandler?.trim(),
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
      uniqueIdentifier: event.target.value,
      participantType: ENROLLMENT_TYPE.TEAM,
    };
    api
      .post(`/v1/participants-request/unique-identifier`, data)
      .then((response) => {
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

      if (!executeRecaptcha) {
        console.log('Execute recaptcha not yet available');
        return;
      }
      setErrors([]);
      const errors = validateSocialForm(formValues);
      if (errors?.length > 0) {
        setErrors(errors);
        return false;
      }
      const requestorEmail = formValues.requestorEmail?.trim();
      const value = formatData();
      try {
        const captchaToken = await executeRecaptcha();

        if (!captchaToken) return;
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
          image = await api
            .post(`/v1/images`, formData, config)
            .then((response) => {
              delete value.logoFile;
              return response?.data?.image;
            });
        }
        const data = {
          participantType: ENROLLMENT_TYPE.TEAM,
          status: 'PENDING',
          requesterEmailId: requestorEmail,
          uniqueIdentifier: value.name,
          newData: { ...value, logoUid: image?.uid, logoUrl: image?.url },
          captchaToken,
        };
        await api.post(`/v1/participants-request`, data).then((response) => {
          setSaveCompleted(true);
        });
      } catch (err) {
        console.log('error', err);
      } finally {
        setIsProcessing(false);
      }
    },
    [executeRecaptcha, formValues]
    // [formValues]
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
            onNameBlur={onNameBlur}
            imageUrl={imageUrl}
            nameExists={nameExists}
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
        image={<TextImage />}
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
                  setErrors,
                  isProcessing,
                  nameExists
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
