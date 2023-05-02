import { useState, ChangeEvent, useCallback, useEffect } from 'react';
import MemberBasicForm from '../components/members/memberbasicform';
import MemberSkillForm from '../components/members/memberskillform';
import MemberSocialForm from '../components/members/membersocialform';
import { IFormValues } from '../utils/members.types';
// import { fetchPendingMemberRequest } from '../utils/services/member';
import { InputField } from '@protocol-labs-network/ui';
import api from '../utils/api';
import { ApprovalLayout } from '../layout/approval-layout';
import { FooterButtons } from '../components/footer-buttons/footer-buttons';
import APP_CONSTANTS, {
  API_ROUTE,
  ENROLLMENT_TYPE,
  ROUTE_CONSTANTS,
} from '../utils/constants';
import router from 'next/router';
import Loader from '../components/common/loader';
import { useNavbarContext } from '../context/navbar-context';
import { toast } from 'react-toastify';
import { parseCookies } from 'nookies';

function validateBasicForm(formValues, imageUrl) {
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
  if (
    !formValues.requestorEmail?.trim() ||
    !formValues.requestorEmail?.match(emailRE)
  ) {
    errors.push('Please add a valid Requestor Email');
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

function validateForm(formValues, imageUrl) {
  let errors = [];
  const basicFormErrors = validateBasicForm(formValues, imageUrl);
  if (basicFormErrors.length) {
    errors = [...errors, ...basicFormErrors];
  }
  const skillFormErrors = validateSkillForm(formValues);
  if (skillFormErrors.length) {
    errors = [...errors, ...skillFormErrors];
  }
  return errors;
}

export default function MemberView(props) {
  console.log('props', props);
  const [errors, setErrors] = useState([]);
  const [dropDownValues, setDropDownValues] = useState({
    skillValues: props?.skills,
    teamNames: props?.teams,
  });
  const [imageUrl, setImageUrl] = useState<string>(props?.imageUrl);
  const [imageChanged, setImageChanged] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [saveCompleted, setSaveCompleted] = useState<boolean>(false);
  const [isEditEnabled, setIsEditEnabled] = useState<boolean>(false);
  const [formValues, setFormValues] = useState<IFormValues>(props?.formValues);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { setIsOpenRequest, setMemberList, setTeamList, setIsTeamActive } =
    useNavbarContext();
  setIsTeamActive(false);
  setMemberList(props.memberList);
  setTeamList(props.teamList);
  setIsOpenRequest(props.status === APP_CONSTANTS.PENDING_LABEL ? true : false);

  useEffect(() => {
    setDropDownValues({ skillValues: props?.skills, teamNames: props?.teams });
  }, [props]);

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
      name: formValues.name?.trim(),
      email: formValues.email?.trim(),
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
    delete formattedData.requestorEmail;
    return formattedData;
  }

  const handleSubmit = useCallback(
    async (e) => {
      setIsLoading(true);
      e.preventDefault();
      setErrors([]);
      const errors = validateForm(formValues, imageUrl);

      if (errors?.length > 0) {
        setErrors(errors);
        setIsLoading(false);
        return false;
      }
      const requestorEmail = formValues.requestorEmail?.trim();
      const values = formatData();
      try {
        let image;
        setIsProcessing(true);
        if (imageChanged) {
          const formData = new FormData();
          formData.append('file', values.imageFile);
          const config = {
            headers: {
              'content-type': 'multipart/form-data',
            },
          };
          image = await api
            .post(API_ROUTE.IMAGES, formData, config)
            .then((response) => {
              return response?.data?.image;
            });
        }

        delete values?.imageFile;
        delete values?.requestorEmail;
        const data = {
          participantType: ENROLLMENT_TYPE.MEMBER,
          // referenceUid: props.id,
          requesterEmailId: requestorEmail,
          uniqueIdentifier: values.email,
          newData: {
            ...values,
            imageUid: image?.uid ?? values.imageUid,
            imageUrl: image?.url ?? imageUrl,
          },
        };
        const configuration = {
          headers: {
            authorization: `Bearer ${props.plnadmin}`,
          },
        };

        await api
          .put(
            `${API_ROUTE.PARTICIPANTS_REQUEST}/${props.id}`,
            data,
            configuration
          )
          .then((response) => {
            setSaveCompleted(true);
            setIsEditEnabled(false);
          });
      } catch (err) {
        toast(err?.message);
        console.log('error', err);
      } finally {
        setIsProcessing(false);
        setIsLoading(false);
      }
    },
    [formValues, imageUrl, imageChanged, props.id]
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

  function redirectToList() {
    const route =
      props.status === APP_CONSTANTS.PENDING_LABEL
        ? ROUTE_CONSTANTS.PENDING_LIST
        : ROUTE_CONSTANTS.CLOSED_LIST;
    router.push({
      pathname: route,
    });
  }

  return (
    <>
      <ApprovalLayout>
        {isLoading && <Loader />}
        <div className="bg-gray-200">
          <div className="relative m-auto w-[40%]">
            <div
              className="cursor-pointer pb-[24px] text-[14px] font-semibold text-[#1D4ED8]"
              onClick={() => redirectToList()}
            >
              Back to requests
            </div>
            <div className="rounded-xl border border-gray-300 bg-white px-11 py-10">
              <div className="inputfield pt-5">
                {errors?.length > 0 && (
                  <div className="w-full rounded-xl bg-white p-5 ">
                    <ul className="list-inside list-disc space-y-1 text-xs text-red-500">
                      {errors.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <InputField
                  required
                  name="requestorEmail"
                  type="email"
                  disabled={!isEditEnabled}
                  label="Requestor Email"
                  value={formValues?.requestorEmail}
                  onChange={handleInputChange}
                  placeholder="Enter your email address"
                  className="custom-grey custom-outline-none border"
                />
              </div>
              <div className="overflow-y-auto">
                <MemberBasicForm
                  formValues={formValues}
                  onChange={handleInputChange}
                  handleImageChange={handleImageChange}
                  imageUrl={imageUrl}
                  isEditEnabled={isEditEnabled}
                />
                <MemberSkillForm
                  formValues={formValues}
                  dropDownValues={dropDownValues}
                  handleDropDownChange={handleDropDownChange}
                  handleAddNewRole={handleAddNewRole}
                  updateParentTeamValue={updateParentTeamValue}
                  updateParentRoleValue={updateParentRoleValue}
                  handleDeleteRolesRow={handleDeleteRolesRow}
                  onChange={handleInputChange}
                  isEditEnabled={isEditEnabled}
                />
                <MemberSocialForm
                  formValues={formValues}
                  onChange={handleInputChange}
                  isEditEnabled={isEditEnabled}
                />
              </div>
            </div>
          </div>
        </div>
      </ApprovalLayout>
      {props.status === APP_CONSTANTS.PENDING_LABEL && (
        <FooterButtons
          isEditEnabled={isEditEnabled}
          setIsEditEnabled={setIsEditEnabled}
          id={props.id}
          type={ENROLLMENT_TYPE.MEMBER}
          saveChanges={handleSubmit}
          referenceUid={props.referenceUid}
          setLoader={setIsLoading}
          token={props.plnadmin}
        />
      )}
    </>
  );
}

export const getServerSideProps = async (context) => {
  const { id, backLink = ROUTE_CONSTANTS.PENDING_LIST } = context.query as {
    id: string;
    backLink: string;
  };
  const { plnadmin } = parseCookies(context);

  if (!plnadmin) {
    const currentUrl = context.resolvedUrl;
    const loginUrl = `/?backlink=${currentUrl}`;
    return {
      redirect: {
        destination: loginUrl,
        permanent: false,
      },
    };
  }
  const config = {
    headers: {
      authorization: `Bearer ${plnadmin}`,
    },
  };

  let formValues: IFormValues;
  let teams, skills, referenceUid, imageUrl, status;
  let memberList = [];
  let teamList = [];

  // Check if provided ID is an Airtable ID, and if so, get the corresponding backend UID

  const [
    requestDetailResponse,
    allRequestResponse,
    memberTeamsResponse,
    skillsResponse,
  ] = await Promise.all([
    api.get(`${API_ROUTE.PARTICIPANTS_REQUEST}/${id}`, config),
    api.get(API_ROUTE.PARTICIPANTS_REQUEST, config),
    api.get(API_ROUTE.TEAMS),
    api.get(API_ROUTE.SKILLS),
  ]);

  if (
    requestDetailResponse.status === 200 &&
    allRequestResponse.status === 200 &&
    memberTeamsResponse.status === 200 &&
    skillsResponse.status === 200
  ) {
    teamList = allRequestResponse?.data?.filter(
      (item) => item.participantType === ENROLLMENT_TYPE.TEAM
    );
    memberList = allRequestResponse?.data?.filter(
      (item) => item.participantType === ENROLLMENT_TYPE.MEMBER
    );

    let counter = 1;
    referenceUid = requestDetailResponse?.data?.referenceUid ?? null;
    const requestData = requestDetailResponse?.data?.newData;
    status = requestDetailResponse?.data?.status;
    const teamAndRoles =
      requestData.teamAndRoles?.length &&
      requestData.teamAndRoles.map((team) => {
        return {
          role: team.role,
          teamUid: team.teamUid,
          teamTitle: team.teamTitle,
          rowId: counter++,
        };
      });
    formValues = {
      name: requestData?.name,
      email: requestData.email,
      imageUid: requestData.imageUid ?? '',
      imageFile: null,
      plnStartDate: new Date(requestData.plnStartDate).toLocaleDateString(
        'af-ZA'
      ),
      city: requestData?.city ?? '',
      region: requestData?.region ?? '',
      country: requestData?.country ?? '',
      linkedinHandler: requestData.linkedinHandler ?? '',
      discordHandler: requestData.discordHandler ?? '',
      twitterHandler: requestData.twitterHandler ?? '',
      githubHandler: requestData.githubHandler ?? '',
      officeHours: requestData.officeHours ?? '',
      requestorEmail: requestDetailResponse?.data?.requesterEmailId ?? '',
      comments: requestData?.comments ?? '',
      teamAndRoles: teamAndRoles || [
        { teamUid: '', teamTitle: '', role: '', rowId: 1 },
      ],
      skills: requestData.skills?.map((item) => {
        return { value: item.uid, label: item.title };
      }),
    };
    imageUrl = requestData?.imageUrl ?? '';

    if (status == APP_CONSTANTS.PENDING_LABEL) {
      teamList = allRequestResponse?.data
        ?.filter((item) => item.participantType === ENROLLMENT_TYPE.TEAM)
        ?.filter((item) => item.status === APP_CONSTANTS.PENDING_LABEL);
      memberList = allRequestResponse?.data
        ?.filter((item) => item.participantType === ENROLLMENT_TYPE.MEMBER)
        .filter((item) => item.status === APP_CONSTANTS.PENDING_LABEL);
    } else {
      teamList = allRequestResponse?.data
        ?.filter((item) => item.participantType === ENROLLMENT_TYPE.TEAM)
        ?.filter((item) => item.status !== APP_CONSTANTS.PENDING_LABEL);
      memberList = allRequestResponse?.data
        ?.filter((item) => item.participantType === ENROLLMENT_TYPE.MEMBER)
        .filter((item) => item.status !== APP_CONSTANTS.PENDING_LABEL);
    }

    teams = memberTeamsResponse?.data?.map((item) => {
      return { value: item.uid, label: item.name };
    });
    skills = skillsResponse?.data?.map((item) => {
      return { value: item.uid, label: item.title };
    });
  }

  // Redirects user to the 404 page if response from
  // getMember is undefined or the member has no teams
  // if (!formValues) {
  //   return {
  //     notFound: true,
  //   };
  // }

  // Cache response data in the browser for 1 minute,
  // and in the CDN for 5 minutes, while keeping it stale for 7 days
  // res.setHeader(
  //   'Cache-Control',
  //   'public, max-age=60, s-maxage=300, stale-while-revalidate=604800'
  // );

  return {
    props: {
      formValues,
      teams,
      skills,
      id,
      referenceUid,
      imageUrl,
      status,
      backLink,
      teamList,
      memberList,
      plnadmin,
    },
  };
};
