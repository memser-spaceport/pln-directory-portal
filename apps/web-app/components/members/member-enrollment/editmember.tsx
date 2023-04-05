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
import { IFormValues } from '../../../utils/members.types';
import Modal from '../../layout/navbar/modal/modal';
import {
  fetchSkills,
  fetchTeams,
} from '../../../utils/services/dropdown-service';
import { fetchMember } from '../../../utils/services/members';
import { InputField } from '@protocol-labs-network/ui';
import api from '../../../utils/api';

interface EditMemberModalProps {
  isOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
  id: string;
}

function validateBasicForm(formValues) {
  const errors = [];
  const emailRE =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (!formValues.name) {
    errors.push('Please add Name.');
  }
  if (!formValues.email || !formValues.email?.match(emailRE)) {
    errors.push('Please add valid Email.');
  }
  if (
    !formValues.requestorEmail ||
    !formValues.requestorEmail?.match(emailRE)
  ) {
    console.log("inside requestor>>>")
    errors.push('Please add valid Requestor Email.');
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

function validateForm(formValues) {
  let errors = [];
  const basicFormErrors = validateBasicForm(formValues);
  if (basicFormErrors.length) {
    errors = [...errors, ...basicFormErrors];
  }
  const skillFormErrors = validateSkillForm(formValues);
  if (skillFormErrors.length) {
    errors = [...errors, ...skillFormErrors];
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

export function EditMemberModal({
  isOpen,
  setIsModalOpen,
  id,
}: EditMemberModalProps) {
  const [errors, setErrors] = useState([]);
  const [dropDownValues, setDropDownValues] = useState({});
  const [imageUrl, setImageUrl] = useState<string>();
  const [imageChanged, setImageChanged] = useState<boolean>(false);
  const [saveCompleted, setSaveCompleted] = useState<boolean>(false);
  const [formValues, setFormValues] = useState<IFormValues>({
    name: '',
    email: '',
    requestorEmail: '',
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
      Promise.all([fetchMember(id), fetchSkills(), fetchTeams()])
        .then((data) => {
          const member = data[0];
          let counter = 1;
          const teamAndRoles =
            member.teamMemberRoles?.length &&
            member.teamMemberRoles.map((team) => {
              return {
                role: team.role,
                teamUid: team.teamUid,
                teamTitle:
                  data[2]?.find((item) => item.value == team.teamUid) ||
                  'protocol',
                rowId: counter++,
              };
            });
          const formValues = {
            name: member.name,
            email: member.email,
            imageUid: member.imageUid,
            imageFile: null,
            plnStartDate: moment(new Date()).format('DD/MM/YYYY'),
            city: member.location?.city,
            region: member.location?.region,
            country: member.location?.country,
            linkedinURL: member.linkedinHandler,
            discordHandler: member.discordHandler,
            twitterHandler: member.twitterHandler,
            githubHandler: member.githubHandler,
            officeHours: member.officeHours,
            comments: '',
            teamAndRoles: teamAndRoles || [],
            skills: member.skills?.map((item) => {
              return { value: item.uid, label: item.title };
            }),
          };
          setImageUrl(member.image?.url);
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
    setImageUrl('');
    setFormValues({
      name: '',
      email: '',
      requestorEmail: '',
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
    // const formattedSkills = formValues.skills.map(item=>{
    //   return {uid: item.value, title: item.label}
    // })
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
          .post(`/v1/images`, formValues.imageFile)
          .then((response) => {
            return response?.data?.image;
          });
      }

      const data = {
        participantType: 'MEMBER',
        referenceUid: id,
        editRequestorEmailId: formValues.requestorEmail,
        newData: { ...formValues, imageUid: image?.uid },
      };
      await api.post(`/v1/participants-request`, data).then((response) => {
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
      <Modal
        isOpen={isOpen}
        onClose={() => handleModalClose()}
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
              <AddMemberBasicForm
                formValues={formValues}
                onChange={handleInputChange}
                handleImageChange={handleImageChange}
                imageUrl={imageUrl}
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
                {getSubmitOrNextButton(handleSubmit)}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
