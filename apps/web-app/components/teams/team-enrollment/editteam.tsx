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
import {
  fetchMembershipSources,
  fetchFundingStages,
  fetchIndustryTags,
  fetchProtocol,
} from '../../../utils/services/dropdown-service';
import { fetchTeam } from '../../../utils/services/teams';
import { IFormValues } from '../../../utils/teams.types';
import api from '../../../utils/api';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';

interface EditTeamModalProps {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
  id: string;
}

function validateBasicForm(formValues, imageUrl) {
  const errors = [];
  const emailRE =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (
    !formValues.requestorEmail?.trim() ||
    !formValues.requestorEmail?.match(emailRE)
  ) {
    errors.push('Please add valid Requestor email.');
  }
  if (!formValues.name?.trim()) {
    errors.push('Please add Team Name.');
  }
  if (!imageUrl) {
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
  if (!formValues.fundingStage) {
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
  return errors;
}

function getSubmitOrNextButton(handleSubmit, isProcessing) {
  const buttonClassName =
    'shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-full justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]';
  const submitOrNextButton = (
    <button
      className={buttonClassName}
      disabled={isProcessing}
      onClick={handleSubmit}
    >
      Request Changes
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
}: EditTeamModalProps) {
  const [errors, setErrors] = useState([]);
  const [imageUrl, setImageUrl] = useState<string>();
  const [imageChanged, setImageChanged] = useState<boolean>(false);
  const [nameExists, setNameExists] = useState<boolean>(false);
  const [dropDownValues, setDropDownValues] = useState({});
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [saveCompleted, setSaveCompleted] = useState<boolean>(false);
  const [formValues, setFormValues] = useState<IFormValues>({
    name: '',
    requestorEmail: '',
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
            membershipSource: team.membershipSources?.map((item) => {
              return { value: item.uid, label: item.title };
            }),
            industryTags: team.industryTags?.map((item) => {
              return { value: item.uid, label: item.title };
            }),
            contactMethod: team.contactMethod,
            website: team.website,
            linkedinHandler: team.linkedinHandler,
            twitterHandle: team.twitterHandler,
            blog: team.blog,
            officeHours: team.officeHours,
          };
          setFormValues(formValues);
          setImageUrl(team.logo.url);
          setDropDownValues({
            membershipSources: data[1],
            fundingStages: data[2],
            industryTags: data[3],
            protocol: data[4],
          });
        })
        .catch((e) => console.error(e));
    }
  }, [isOpen, id]);

  function resetState() {
    setErrors([]);
    setDropDownValues({});
    setImageChanged(false);
    setSaveCompleted(false);
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

    const formattedValue = {
      ...formValues,
      fundingStage: formattedFundingStage,
      industryTags: formattedTags,
      membershipSource: formattedMembershipSource,
      technologies: formattedtechnologies,
    };
    delete formattedValue.requestorEmail;
    return formattedValue;
  }

  function onNameBlur(event: ChangeEvent<HTMLInputElement>) {
    const data = {
      uniqueIdentifier: event.target.value,
      participantType: 'team',
    };
    api
      .post(`/participants-request/unique-identifier-checker`, data)
      .then((response) => {
        response?.data.length ? setNameExists(true) : setNameExists(false);
      });
  }

  const handleSubmit = useCallback(
    async (e) => {
      if (nameExists) return;
      e.preventDefault();
      if (!executeRecaptcha) {
        console.log('Execute recaptcha not yet available');
        return;
      }
      const errors = validateForm(formValues, imageUrl);
      if (errors?.length > 0) {
        setErrors(errors);
        return false;
      }
      const requestorEmail = formValues.requestorEmail;
      const values = formatData();
      try {
        const captchaToken = await executeRecaptcha();

        if (!captchaToken) return;
        let image;
        setIsProcessing(true);
        if (imageChanged) {
          image = await api
            .post(`/v1/images`, values.logoFile)
            .then((response) => {
              delete values.logoFile;
              return response?.data?.image;
            });
        }
        const data = {
          participantType: 'TEAM',
          referenceUid: id,
          editRequestorEmailId: requestorEmail,
          newData: { ...values, logoUid: image?.uid },
          captchaToken,
        };
        await api.post(`/v1/participants-request`, data).then((response) => {
          setIsProcessing(false);
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
    setImageChanged(true);
  };

  function handleDropDownChange(selectedOption, name) {
    setFormValues({ ...formValues, [name]: selectedOption });
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
            <div className="px-8">
              <span className="font-size-14 text-sm">
                Please fill out only the fields you would like to change for
                this member. If there is something you want to change that is
                not available, please leave a detailed explanation in
                &quot;Additional Notes&quot;. If you don&apos;t want to change a
                field, leave it blank.
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
            <div className="overflow-y-auto">
              <AddTeamStepOne
                formValues={formValues}
                handleInputChange={handleInputChange}
                handleDropDownChange={handleDropDownChange}
                handleImageChange={handleImageChange}
                imageUrl={imageUrl}
                onNameBlur={onNameBlur}
                nameExists={nameExists}
              />
              <AddTeamStepTwo
                formValues={formValues}
                dropDownValues={dropDownValues}
                handleInputChange={handleInputChange}
                handleDropDownChange={handleDropDownChange}
              />
              <AddTeamStepThree
                formValues={formValues}
                handleInputChange={handleInputChange}
                handleDropDownChange={handleDropDownChange}
              />
            </div>
            <div className="footerdiv flow-root w-full px-8">
              <div className="float-left m-2">
                {getCancelOrBackButton(handleModalClose)}
              </div>
              <div className="float-right m-2">
                {getSubmitOrNextButton(handleSubmit, isProcessing)}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
