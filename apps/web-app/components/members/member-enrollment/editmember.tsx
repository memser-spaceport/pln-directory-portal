import {
  Dispatch,
  SetStateAction,
  useState,
  useEffect,
  ChangeEvent,
  useCallback,
  Fragment,
} from 'react';
import { useRouter } from 'next/router';
import AddMemberBasicForm from './addmemberbasicform';
import AddMemberSkillForm from './addmemberskillform';
import AddMemberSocialForm from './addmembersocialform';
import { RequestPending } from '../../shared/request-pending/request-pending';
import { IFormValues } from '../../../utils/members.types';
import Modal from '../../layout/navbar/modal/modal';
import {
  fetchSkills,
  fetchTeams,
} from '../../../utils/services/dropdown-service';
import { fetchMember } from '../../../utils/services/members';
import { InputField, Loader } from '@protocol-labs-network/ui';
import api from '../../../utils/api';
import { ENROLLMENT_TYPE } from '../../../constants';
import { ReactComponent as TextImage } from '/public/assets/images/edit-member.svg';
import { LoadingIndicator } from '../../shared/loading-indicator/loading-indicator';
import { requestPendingCheck } from '../../../utils/services/members';
// import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';

interface EditMemberModalProps {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
  id: string;
  isProfileSettings?: boolean;
}

function validateBasicForm(formValues, imageUrl, isProfileSettings) {
  const errors = [];
  const emailRE =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (!formValues.name.trim()) {
    errors.push('Please add your Name');
  }
  if (!formValues.email.trim() || !formValues.email?.match(emailRE)) {
    errors.push('Please add valid Email');
  }
  if (!imageUrl) {
    errors.push('Please upload a profile image');
  }
  if (!isProfileSettings) {
    if (
      !formValues.requestorEmail?.trim() ||
      !formValues.requestorEmail?.match(emailRE)
    ) {
      errors.push('Please add valid Requestor Email.');
    }
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
      errors.push('Please add missing Team(s)/Role(s)');
    }
  }
  if (!formValues.skills.length) {
    errors.push('Please add your skill details');
  }
  return errors;
}

function validateForm(formValues, imageUrl, isProfileSettings) {
  let errors = [];
  const basicFormErrors = validateBasicForm(
    formValues,
    imageUrl,
    isProfileSettings
  );
  if (basicFormErrors.length) {
    errors = [...errors, ...basicFormErrors];
  }
  const skillFormErrors = validateSkillForm(formValues);
  if (skillFormErrors.length) {
    errors = [...errors, ...skillFormErrors];
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

// function getResetButton(handleReset) {
//   const resetButton = (
//     <button
//       className="hadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-full justify-center rounded-full px-6 py-2 text-base font-semibold leading-6 text-[#156FF7] outline outline-1 outline-[#156FF7] hover:outline-2"
//       onClick={() => handleReset()}
//     >
//       Reset
//     </button>
//   );
//   return resetButton;
// }

export function EditMemberModal({
  isOpen,
  setIsModalOpen,
  id,
  isProfileSettings = false,
}: EditMemberModalProps) {
  const [openTab, setOpenTab] = useState(1);
  const [errors, setErrors] = useState([]);
  const [dropDownValues, setDropDownValues] = useState({});
  const [imageUrl, setImageUrl] = useState<string>();
  // const [emailExists, setEmailExists] = useState<boolean>(false);
  const [imageChanged, setImageChanged] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [saveCompleted, setSaveCompleted] = useState<boolean>(false);
  const [formValues, setFormValues] = useState<IFormValues>({
    name: '',
    email: '',
    requestorEmail: '',
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
  const [isPendingRequestModalOpen, setIsPendingRequestModalOpen] =
    useState(false);
  const router = useRouter();

  // const { executeRecaptcha } = useGoogleReCaptcha();

  useEffect(() => {
    if (isOpen || isProfileSettings) {
      Promise.all([fetchMember(id), fetchSkills(), fetchTeams()])
        .then((data) => {
          const member = data[0];
          let counter = 1;
          const teamAndRoles =
            member.teamMemberRoles?.length &&
            member.teamMemberRoles.map((team) => {
              const teamName =
                data[2]?.filter((item) => item.value == team.teamUid)?.[0]
                  ?.label ?? '';
              return {
                role: team.role,
                teamUid: team.teamUid,
                teamTitle: teamName,
                rowId: counter++,
              };
            });
          const formValues = {
            name: member.name,
            email: member.email,
            imageUid: member.imageUid,
            imageFile: null,
            plnStartDate: new Date(member.plnStartDate).toLocaleDateString(
              'af-ZA'
            ),
            city: member.location?.city,
            region: member.location?.region,
            country: member.location?.country,
            linkedinHandler: member.linkedinHandler,
            discordHandler: member.discordHandler,
            twitterHandler: member.twitterHandler,
            githubHandler: member.githubHandler,
            officeHours: member.officeHours,
            comments: '',
            teamAndRoles: teamAndRoles || [
              { teamUid: '', teamTitle: '', role: '', rowId: 1 },
            ],
            skills: member.skills?.map((item) => {
              return { value: item.uid, label: item.title };
            }),
          };
          setImageUrl(member.image?.url ?? '');
          setFormValues(formValues);
          setDropDownValues({ skillValues: data[1], teamNames: data[2] });
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
    setImageUrl('');
    setFormValues({
      name: '',
      email: '',
      requestorEmail: '',
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
      teamAndRoles: [],
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

  function returnToHome() {
    router.push('/directory/teams');
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

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setErrors([]);
      const errors = validateForm(formValues, imageUrl, isProfileSettings);
      // if (!executeRecaptcha) {
      //   console.log('Execute recaptcha not yet available');
      //   return;
      // }
      if (errors?.length > 0) {
        setErrors(errors);
        return false;
      }
      const values = formatData();
      try {
        // const captchaToken = await executeRecaptcha();

        // if (!captchaToken) return;
        let image;
        setIsProcessing(true);
        if (imageChanged) {
          const formData = new FormData();
          formData.append('file', values.imageFile);
          const config = {
            headers: {
              'contentsetIsProcessing-type': 'multipart/form-data',
            },
          };
          image = await api
            .post(`/v1/images`, formData, config)
            .then((response) => {
              return response?.data?.image;
            });
        }

        delete values?.imageFile;
        delete values?.requestorEmail;

        const data = {
          participantType: ENROLLMENT_TYPE.MEMBER,
          referenceUid: id,
          requesterEmailId: isProfileSettings
            ? values.email
            : values.requestorEmail,
          uniqueIdentifier: values.email,
          newData: {
            ...values,
            imageUid: image?.uid ?? values.imageUid,
            imageUrl: image?.url ?? imageUrl,
          },
          // captchaToken,
        };
        if (isProfileSettings) {
          const res = await requestPendingCheck(values.email);
          if (res?.isRequestPending) {
            setIsPendingRequestModalOpen(true);
            return false;
          }
        }
        await api.post(`/v1/participants-request`, data).then((response) => {
          setSaveCompleted(true);
        });
      } catch (err) {
        console.log('error', err);
      } finally {
        setIsProcessing(false);
      }
    },
    // [executeRecaptcha, formValues, imageUrl, imageChanged]
    [formValues, imageUrl, imageChanged]
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
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => setImageUrl(reader.result as string);
    setFormValues({ ...formValues, imageFile: file });
    setImageChanged(true);
  };

  function handleDeleteRolesRow(rowId) {
    const newRoles = formValues.teamAndRoles.filter(
      (item) => item.rowId != rowId
    );
    setFormValues({ ...formValues, teamAndRoles: newRoles });
  }

  return (
    <>
      {isProfileSettings ? (
        <div className="h-full w-full">
          <div className="mx-auto mb-40 h-full w-2/4 px-5">
            <h1 className="text-2xl font-bold">Profile Settings</h1>
            {!saveCompleted && (
              <div className="mt-3 flex h-10 w-full w-3/5  justify-start text-slate-400">
                <button
                  className={`w-1/4 border-b-4 border-transparent text-base font-medium ${
                    openTab == 1 ? 'border-b-[#156FF7] text-[#156FF7]' : ''
                  }`}
                  onClick={() => setOpenTab(1)}
                >
                  {' '}
                  Basic{' '}
                </button>
                <button
                  className={`w-1/4 border-b-4 border-transparent text-base font-medium ${
                    openTab == 2 ? 'border-b-[#156FF7] text-[#156FF7]' : ''
                  }`}
                  onClick={() => setOpenTab(2)}
                >
                  {' '}
                  Skills
                </button>
                <button
                  className={`w-1/4 border-b-4 border-transparent text-base font-medium ${
                    openTab == 3 ? 'border-b-[#156FF7] text-[#156FF7]' : ''
                  }`}
                  onClick={() => setOpenTab(3)}
                >
                  {' '}
                  Social{' '}
                </button>
              </div>
            )}
            <div className="mt-3 w-full rounded-md border bg-white  px-6 py-10">
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
                      onClick={() => returnToHome()}
                    >
                      Return to home
                    </button>
                  </div>
                </div>
              ) : (
                <Fragment>
                  {errors?.length > 0 && (
                    <div className="w-full rounded-lg bg-white p-5 ">
                      <ul className="list-inside list-disc space-y-1 text-xs text-red-500">
                        {errors.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className={openTab === 1 ? 'block' : 'hidden'}>
                    <AddMemberBasicForm
                      formValues={formValues}
                      onChange={handleInputChange}
                      handleImageChange={handleImageChange}
                      imageUrl={imageUrl}
                    />
                  </div>
                  <div className={openTab === 2 ? 'block' : 'hidden'}>
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
                  </div>
                  <div className={openTab === 3 ? 'block' : 'hidden'}>
                    <AddMemberSocialForm
                      formValues={formValues}
                      onChange={handleInputChange}
                    />
                  </div>
                </Fragment>
              )}
            </div>
          </div>
          {!saveCompleted && (
            <div className="footerdiv fixed bottom-0 w-full bg-white px-8">
              {/* <div className="float-left">
								{getResetButton(()=>{
									router.reload();
								})}
							</div> */}
              <div className="float-right">
                {getSubmitOrNextButton(handleSubmit, isProcessing)}
              </div>
            </div>
          )}
          <RequestPending
            isOpen={isPendingRequestModalOpen}
            setIsModalOpen={setIsPendingRequestModalOpen}
          />
        </div>
      ) : (
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
            <div>
              <div className="px-8">
                <span className="font-size-14 text-sm">
                  Please fill out only the fields you would like to change for
                  this member. If there is something you want to change that is
                  not available, please leave a detailed explanation in
                  &quot;Additional Notes&quot;. If you don&apos;t want to change
                  a field, leave it blank.
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
              <div className="inputfield px-8 pb-10 pt-4">
                <InputField
                  required
                  name="requestorEmail"
                  type="email"
                  label="Requestor Email"
                  value={formValues?.requestorEmail}
                  onChange={handleInputChange}
                  placeholder="Enter your email address"
                  className="custom-grey custom-outline-none border"
                />
              </div>
              <div className="overflow-y-auto">
                <AddMemberBasicForm
                  formValues={formValues}
                  onChange={handleInputChange}
                  handleImageChange={handleImageChange}
                  imageUrl={imageUrl}
                  // emailExists={emailExists}
                />
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
                <AddMemberSocialForm
                  formValues={formValues}
                  onChange={handleInputChange}
                />
              </div>
              <div className="footerdiv flow-root w-full px-8">
                <div className="float-left">
                  {getCancelOrBackButton(handleModalClose)}
                </div>
                <div className="float-right">
                  {getSubmitOrNextButton(handleSubmit, isProcessing)}
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
