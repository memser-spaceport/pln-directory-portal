import { useState, ChangeEvent, useCallback } from 'react';
import TeamStepOne from '../components/teams/teamstepone';
import TeamStepTwo from '../components/teams/teamsteptwo';
import TeamStepThree from '../components/teams/teamstepthree';
// import {
//   fetchMembershipSources,
//   fetchFundingStages,
//   fetchIndustryTags,
//   fetchProtocol,
// } from '../utils/services/shared';
import { IFormValues } from '../utils/teams.types';
import api from '../utils/api';
import APP_CONSTANTS, {
  API_ROUTE,
  ENROLLMENT_TYPE,
  ROUTE_CONSTANTS,
} from '../utils/constants';
import { ApprovalLayout } from '../layout/approval-layout';
import { FooterButtons } from '../components/footer-buttons/footer-buttons';
import router from 'next/router';
import Loader from '../components/common/loader';
import { useNavbarContext } from '../context/navbar-context';
import { toast } from 'react-toastify';
import { parseCookies } from 'nookies';

function validateBasicForm(formValues, imageUrl) {
  const errors = [];
  const emailRE =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (
    !formValues.requestorEmail?.trim() ||
    !formValues.requestorEmail?.match(emailRE)
  ) {
    errors.push('Please add a valid Requestor email');
  }
  if (!formValues.name?.trim()) {
    errors.push('Please add Team Name');
  }
  if (!formValues.shortDescription?.trim()) {
    errors.push('Please add a Description');
  }
  if (!formValues.longDescription?.trim()) {
    errors.push('Please add a Long Description');
  }
  return errors;
}

function validateProjectDetailForm(formValues) {
  const errors = [];
  if (!formValues.fundingStage?.value) {
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

export default function TeamView(props) {
  const [errors, setErrors] = useState([]);
  const [imageUrl, setImageUrl] = useState<string>(props?.imageUrl);
  const [imageChanged, setImageChanged] = useState<boolean>(false);
  const [dropDownValues, setDropDownValues] = useState({
    membershipSources: props?.membershipSources,
    fundingStages: props?.fundingStages,
    industryTags: props?.industryTags,
    protocol: props?.technologies,
  });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [saveCompleted, setSaveCompleted] = useState<boolean>(false);
  const [isEditEnabled, setIsEditEnabled] = useState<boolean>(false);
  const [disableSave, setDisableSave] = useState<boolean>(false);
  const [nameExists, setNameExists] = useState<boolean>(false);
  const [formValues, setFormValues] = useState<IFormValues>(props?.formValues);
  const {
    setIsOpenRequest,
    setMemberList,
    setTeamList,
    setIsTeamActive,
    setShowMenu,
  } = useNavbarContext();
  setIsTeamActive(true);
  setMemberList(props.memberList);
  setTeamList(props.teamList);
  setShowMenu(false);
  setIsOpenRequest(props.status === APP_CONSTANTS.PENDING_LABEL ? true : false);

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
      uniqueIdentifier: event.target.value?.trim(),
      participantType: ENROLLMENT_TYPE.TEAM,
      uid: props.referenceUid,
      requestId: props.id,
    };
    api
      .post(`/v1/participants-request/unique-identifier`, data)
      .then((response) => {
        setDisableSave(false);
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
      if (nameExists) {
        toast('Name already exists');
        return;
      }
      setErrors([]);
      const errors = validateForm(formValues, imageUrl);
      if (errors?.length > 0) {
        setErrors(errors);
        return false;
      }
      const requestorEmail = formValues.requestorEmail;
      const values = formatData();
      try {
        let image;
        setIsProcessing(true);
        if (imageChanged) {
          const formData = new FormData();
          formData.append('file', values.logoFile);
          const config = {
            headers: {
              'content-type': 'multipart/form-data',
            },
          };
          image = await api
            .post(API_ROUTE.IMAGES, formData, config)
            .then((response) => {
              delete values.logoFile;
              return response?.data?.image;
            });
        }
        const configuration = {
          headers: {
            authorization: `Bearer ${props.plnadmin}`,
          },
        };
        const data = {
          participantType: ENROLLMENT_TYPE.TEAM,
          // referenceUid: props?.id,
          requesterEmailId: requestorEmail,
          uniqueIdentifier: values.name,
          newData: {
            ...values,
            logoUid: image?.uid ?? values.logoUid,
            logoUrl: image?.url ?? imageUrl,
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
      }
    },
    [formValues, imageUrl, imageChanged, nameExists]
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

  const onRemoveImage = () => {
    setFormValues({ ...formValues, logoFile: null });
    setImageUrl('');
  };

  function handleDropDownChange(selectedOption, name) {
    setFormValues({ ...formValues, [name]: selectedOption });
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
        {isProcessing && <Loader />}
        <div className="bg-gray-200">
          <div className="relative m-auto w-[40%]">
            <div
              className="cursor-pointer py-[20px] text-[14px] font-semibold text-[#1D4ED8]"
              onClick={() => redirectToList()}
            >
              Back to requests
            </div>
            <div className="rounded-xl border border-gray-300 bg-white px-11 py-10">
              <div className="inputfield pt-5">
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
                  <TeamStepOne
                    formValues={formValues}
                    handleInputChange={handleInputChange}
                    handleDropDownChange={handleDropDownChange}
                    handleImageChange={handleImageChange}
                    imageUrl={imageUrl}
                    isEditEnabled={isEditEnabled}
                    onNameBlur={onNameBlur}
                    nameExists={nameExists}
                    setDisableNext={setDisableSave}
                    onRemoveImage={onRemoveImage}
                  />
                  <TeamStepTwo
                    formValues={formValues}
                    dropDownValues={dropDownValues}
                    handleInputChange={handleInputChange}
                    handleDropDownChange={handleDropDownChange}
                    isEditEnabled={isEditEnabled}
                  />
                  <TeamStepThree
                    formValues={formValues}
                    handleInputChange={handleInputChange}
                    handleDropDownChange={handleDropDownChange}
                    isEditEnabled={isEditEnabled}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </ApprovalLayout>
      {props.status === APP_CONSTANTS.PENDING_LABEL && (
        <FooterButtons
          isEditEnabled={isEditEnabled}
          disableSave={disableSave}
          setIsEditEnabled={setIsEditEnabled}
          id={props.id}
          type={ENROLLMENT_TYPE.TEAM}
          saveChanges={handleSubmit}
          referenceUid={props.referenceUid}
          setLoader={setIsProcessing}
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
  let membershipSources = [];
  let fundingStages = [];
  let industryTags = [];
  let technologies = [];
  let memberList = [];
  let teamList = [];
  let referenceUid, imageUrl, status;

  const [
    requestDetailResponse,
    allRequestResponse,
    membershipSourcesResponse,
    fundingStagesResponse,
    industryTagsResponse,
    technologiesResponse,
  ] = await Promise.all([
    api.get(`${API_ROUTE.PARTICIPANTS_REQUEST}/${id}`, config),
    api.get(API_ROUTE.PARTICIPANTS_REQUEST, config),
    api.get(API_ROUTE.MEMBERSHIP),
    api.get(API_ROUTE.FUNDING_STAGE),
    api.get(API_ROUTE.INDUSTRIES),
    api.get(API_ROUTE.TECHNOLOGIES),
  ]);

  if (
    requestDetailResponse.status === 200 &&
    allRequestResponse.status === 200 &&
    membershipSourcesResponse.status === 200 &&
    fundingStagesResponse.status === 200 &&
    industryTagsResponse.status === 200 &&
    technologiesResponse.status === 200
  ) {
    referenceUid = requestDetailResponse?.data?.referenceUid ?? '';
    const team = requestDetailResponse?.data?.newData;
    status = requestDetailResponse?.data?.status;
    formValues = {
      name: team.name,
      logoUid: team?.logoUid ?? '',
      logoFile: null,
      shortDescription: team.shortDescription ?? '',
      longDescription: team.longDescription ?? '',
      requestorEmail: requestDetailResponse.data.requesterEmailId ?? '',
      technologies: team.technologies?.map((item) => {
        return { value: item.uid, label: item.title };
      }),
      fundingStage: {
        value: team.fundingStage?.uid,
        label: team.fundingStage?.title,
      },
      membershipSources:
        team.membershipSources?.map((item) => {
          return { value: item.uid, label: item.title };
        }) ?? [],
      industryTags: team.industryTags?.map((item) => {
        return { value: item.uid, label: item.title };
      }),
      contactMethod: team.contactMethod ?? '',
      website: team.website ?? '',
      linkedinHandler: team.linkedinHandler ?? '',
      twitterHandler: team.twitterHandler ?? '',
      blog: team.blog ?? '',
      officeHours: team.officeHours ?? '',
    };
    imageUrl = team?.logoUrl ?? '';

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

    membershipSources = membershipSourcesResponse?.data.map((item) => {
      return { value: item.uid, label: item.title };
    });
    fundingStages = fundingStagesResponse?.data.map((item) => {
      return { value: item.uid, label: item.title };
    });
    industryTags = industryTagsResponse?.data.map((item) => {
      return { value: item.uid, label: item.title };
    });
    technologies = technologiesResponse?.data.map((item) => {
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

  return {
    props: {
      formValues,
      membershipSources,
      fundingStages,
      industryTags,
      technologies,
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
