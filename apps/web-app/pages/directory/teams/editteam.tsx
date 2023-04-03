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
import {
  fetchMembershipSources,
  fetchFundingStages,
  fetchIndustryTags,
  fetchProtocol,
} from '../../../utils/services/dropdown-service';

interface AddTeamModalProps {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
  id: string;
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

function getSubmitOrNextButton(formStep, setIsModalOpen, setFormStep) {
  const buttonClassName =
    'shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-full justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]';
  const submitOrNextButton =
    formStep === 3 ? (
      <button className={buttonClassName} onClick={() => setIsModalOpen(false)}>
        Add to Network
      </button>
    ) : (
      <button
        className={buttonClassName}
        onClick={() => setFormStep(++formStep)}
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

export function EditTeamModal({
  isOpen,
  setIsModalOpen,
  id,
}: AddTeamModalProps) {
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

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;
    setFormValues({ ...formValues, [name]: value });
  }

  function handleDropDownChange(selectedOption, name) {
    setFormValues({ ...formValues, [name]: selectedOption });
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        setIsOpen={setIsModalOpen}
        enableFooter={false}
        image="/assets/images/join_as_a_member.jpg"
      >
        {errors?.length > 0 && (
          <div className="w-full rounded-lg border border-gray-200 bg-white p-10 shadow hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700">
            <ul className="list-inside list-disc space-y-1 text-red-500 dark:text-gray-400">
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
          />
          ;
          <AddTeamStepTwo
            formValues={formValues}
            dropDownValues={dropDownValues}
            handleInputChange={handleInputChange}
            handleDropDownChange={handleDropDownChange}
          />
          ;
          <AddTeamStepThree
            formValues={formValues}
            handleInputChange={handleInputChange}
            handleDropDownChange={handleDropDownChange}
          />
          ;
        </div>
        <div className="bottom flow-root">
          <div className="float-left m-2">
            {getCancelOrBackButton(formStep, setIsModalOpen, setFormStep)}
          </div>
          <div className="float-right m-2">
            {getSubmitOrNextButton(formStep, setIsModalOpen, setFormStep)}
          </div>
        </div>
      </Modal>
    </>
  );
}
