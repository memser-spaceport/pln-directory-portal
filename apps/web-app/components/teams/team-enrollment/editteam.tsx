import { InputField } from '@protocol-labs-network/ui';
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
import Modal from '../../layout/navbar/modal/modal';
import {
  fetchMembershipSources,
  fetchFundingStages,
  fetchIndustryTags,
  fetchProtocol,
} from '../../../utils/services/dropdown-service';
import { fetchTeam } from '../../../utils/services/teams';
import {IFormValues} from '../../../utils/teams.types';
import api from '../../../utils/api';

interface EditTeamModalProps {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
  id: string;
}

function validateBasicForm(formValues) {
  const errors = [];
  const emailRE =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (
    !formValues.requestorEmail ||
    !formValues.requestorEmail?.match(emailRE)
  ) {
    errors.push('Please add valid Requestor email.');
  }
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
  const errors = [];
  if (!formValues.contactMethod) {
    errors.push('Please add Preferred method of contact');
  }
  if (!formValues.website) {
    errors.push('Please add website');
  }
  return errors;
}

function validateForm(formValues) {
  let errors = [];
  const basicFormErrors = validateBasicForm(formValues);
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

function getSubmitOrNextButton(handleSubmit) {
  const buttonClassName =
    'shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-full justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]';
  const submitOrNextButton = (
    <button className={buttonClassName} onClick={handleSubmit}>
      Request Changes
    </button>
  );
  return submitOrNextButton;
}

function getCancelOrBackButton(handleModalClose) {
  const cancelorBackButton = (
    <button
      className="on-focus leading-3.5 text-md mr-2 mb-2 rounded-full border border-slate-300 px-5 py-3 text-left font-medium last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full"
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
  const [dropDownValues, setDropDownValues] = useState({});
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
            technologies: data[4],
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

    setFormValues({
      ...formValues,
      fundingStage: formattedFundingStage,
      industryTags: formattedTags,
      membershipSource: formattedMembershipSource,
      technologies: formattedtechnologies,
    });
  }

  async function handleSubmit() {
    const errors = validateForm(formValues);
    if (errors?.length > 0) {
      setErrors(errors);
      return false;
    }
    formatData();
    try {
      let image;
      if (imageChanged) {
        image = await api
          .post(`/v1/participants-request`, formValues.logoFile)
          .then((response) => {
            return response?.data;
          });
      }

      const data = {
        participantType: 'TEAM',
        status: 'PENDING',
        requesterEmail: formValues.requestorEmail,
        newData: { ...formValues, logoUid: image?.uid },
      };
      console.log('team>>>', data);
      await api.put(`/v1/participants-request`, data).then((response) => {
        setSaveCompleted(true);
      });
    } catch (err) {
      console.log('error', err);
    }
  }

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
            <div className="inputfield px-8 pt-4 pb-10">
              <InputField
                required
                name="requestorEmail"
                type="email"
                label="Requestor Email"
                value={formValues?.requestorEmail}
                onChange={handleInputChange}
                placeholder="Enter your email address"
              />
            </div>
            <div className="overflow-y-auto">
              <AddTeamStepOne
                formValues={formValues}
                handleInputChange={handleInputChange}
                handleDropDownChange={handleDropDownChange}
                handleImageChange={handleImageChange}
                imageUrl={imageUrl}
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
                {getSubmitOrNextButton(handleSubmit)}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
