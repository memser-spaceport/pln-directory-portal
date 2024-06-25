import { getMember, getMemberPreferences, getMembers } from '@protocol-labs-network/members/data-access';
import { getTeams } from '@protocol-labs-network/teams/data-access';
import { Autocomplete, Breadcrumb, Dropdown } from '@protocol-labs-network/ui';
import { trackGoal } from 'fathom-client';
import { NextSeo } from 'next-seo';
import { setCookie } from 'nookies';
import Cookies from 'js-cookie';
import React, { ReactElement, useEffect, useReducer, useState } from 'react';
import { EditMemberModal } from 'apps/web-app/components/members/member-enrollment/editmember';
import { EditTeamModal } from 'apps/web-app/components/teams/team-enrollment/editteam';
import {
  ADMIN_ROLE,
  MSG_CONSTANTS,
  PAGE_ROUTES,
  SETTINGS_CONSTANTS,
  FATHOM_EVENTS,
  PRIVACY_CONSTANTS,
} from 'apps/web-app/constants';
import { useProfileBreadcrumb } from 'apps/web-app/hooks/profile/use-profile-breadcrumb.hook';
import { DirectoryLayout } from 'apps/web-app/layouts/directory-layout';
import { DIRECTORY_SEO } from 'apps/web-app/seo.config';
import api from 'apps/web-app/utils/api';
import { fetchMember } from 'apps/web-app/utils/services/members';
import { fetchTeam } from 'apps/web-app/utils/services/teams';
import {
  renewAndStoreNewAccessToken,
  convertCookiesToJson,
  decodeToken,
  calculateExpiry,
} from '../utils/services/auth';
import { DiscardChangesPopup } from 'libs/ui/src/lib/modals/confirmation';
import Privacy from 'apps/web-app/components/preference/privacy';
import { updateUserDirectoryEmail } from '../services/member.service';
import { toast } from 'react-toastify';
import useAuthAnalytics from '../analytics/auth.analytics';

export const SettingsContext = React.createContext({ state: null, dispatch: null });

export default function Settings({
  backLink,
  userInfo,
  teamsDropdown,
  membersDropdown,
  tabSelection,
  teamSelected,
  memberSelected,
  settingCategory,
  preferences,
  authLinkedAccounts,
}) {
  const [activeSetting, setActiveSetting] = useState(settingCategory ?? SETTINGS_CONSTANTS.PROFILE_SETTINGS);
  const [selectedTeam, setSelectedTeam] = useState(
    teamSelected ? teamSelected : teamsDropdown && teamsDropdown.length ? teamsDropdown[0] : null
  );
  const [teamsDropdownOptions, setteamsDropdown] = useState(teamsDropdown ? teamsDropdown : null);
  const [selectedMember, setSelectedMember] = useState(
    memberSelected ? memberSelected : membersDropdown && membersDropdown.length ? membersDropdown[0] : null
  );
  const [isModified, setModified] = useState<boolean>(false);
  const [refreshTeamAutocomplete, setRefreshTeamAutocomplete] = useState<boolean>(false);
  const [refreshMemberAutocomplete, setRefreshMemberAutocomplete] = useState<boolean>(false);
  const [isModifiedMember, setModifiedMember] = useState<boolean>(false);
  const [isPflModified, setModifiedProfile] = useState<boolean>(false);
  const [openValidationPopup, setOpenValidationPopup] = useState<boolean>(false);
  const [authAccounts, setAuthAccounts] = useState(authLinkedAccounts ?? '');
  // const [isPrivacyModified, setPrivacymodifiedFlag] = useState<boolean>(false);

  const analytics = useAuthAnalytics();

  function settingsReducer(state, action) {
    let newState = { ...state };
    switch (action.type) {
      case 'SET_PREFERENCE':
        newState.preferences = { ...action.payload };
        break;
      case 'SET_PRIVACY_MODIFIED':
        newState.privacyModifiedFlag = action.payload;
        break;
    }

    return newState;
  }
  const [state, dispatch] = useReducer(settingsReducer, {
    preferences: preferences?.isnull
      ? { ...JSON.parse(JSON.stringify(PRIVACY_CONSTANTS.DEFAULT_SETTINGS)), ...preferences }
      : preferences,
  });

  useEffect(() => {
    if (refreshTeamAutocomplete) {
      if (userInfo?.roles.length && userInfo?.roles.includes(ADMIN_ROLE)) {
        updateTeamAutocomplete();
      } else if (userInfo?.leadingTeams?.length) {
        updateDropdown();
      }
    }
  }, [refreshTeamAutocomplete]);

  useEffect(() => {
    if (refreshMemberAutocomplete) {
      if (userInfo?.roles.length && userInfo?.roles.includes(ADMIN_ROLE)) {
        updateMemberAutocomplete();
      }
    }
  }, [refreshMemberAutocomplete]);

  useEffect(() => {
    function authAccountsHandler(e) {
      const refreshToken = Cookies.get('refreshToken');
      const refreshTokenExpiry = decodeToken(JSON.parse(refreshToken));
      Cookies.set('authLinkedAccounts', JSON.stringify(e.detail), {
        expires: new Date(refreshTokenExpiry.exp * 1000),
        path: '/',
        domain: process.env.COOKIE_DOMAIN || '',
      });
      setAuthAccounts(e.detail);
    }

    async function updateUserEmail(e) {
      try {
      const newEmail = e.detail.newEmail
      const oldAccessToken = Cookies.get('authToken');
      const header = {headers: {Authorization: `Bearer ${JSON.parse(oldAccessToken)}`}}
      if(newEmail === userInfo.email) {
        analytics.onUpdateSameEmailProvided({newEmail, oldEmail:userInfo.email})
        document.dispatchEvent(new CustomEvent('app-loader-status'));
        toast.error('New and current email cannot be same');
        return;
      }
      const result = await updateUserDirectoryEmail({newEmail}, userInfo.uid, header)
      const { refreshToken, accessToken, userInfo: newUserInfo} = result;
        if (refreshToken && accessToken) {
            const accessTokenExpiry = decodeToken(accessToken);
            const refreshTokenExpiry = decodeToken(refreshToken);
            Cookies.set('authToken', JSON.stringify(accessToken), { 
                expires: new Date(accessTokenExpiry.exp * 1000),
                domain: process.env.COOKIE_DOMAIN || '',
               
            });
            Cookies.set('refreshToken', JSON.stringify(refreshToken), {
                expires: new Date(refreshTokenExpiry.exp * 1000),
                domain: process.env.COOKIE_DOMAIN || '',
              
            });
            Cookies.set('userInfo', JSON.stringify(newUserInfo), { 
                expires: new Date(refreshTokenExpiry.exp * 1000),
                domain: process.env.COOKIE_DOMAIN || '',
            });
            document.dispatchEvent(new CustomEvent('app-loader-status'))
            analytics.onUpdateEmailSuccess({newEmail, oldEmail:userInfo.email})
            toast.success('Email Updated Successfully')
            window.location.reload();
        }
      } catch (err) {
        const newEmail = e.detail.newEmail;
        analytics.onUpdateEmailFailure({newEmail, oldEmail:userInfo.email})
        document.dispatchEvent(new CustomEvent('app-loader-status'))
        toast.error('Email Update Failed')
      }
    }

    document.addEventListener('new-auth-accounts', authAccountsHandler);
    document.addEventListener('directory-update-email', updateUserEmail)
    return function () {
      document.removeEventListener('new-auth-accounts', authAccountsHandler);
      document.removeEventListener('directory-update-email', updateUserEmail)
    };
  }, []);

  const updateTeamAutocomplete = () => {
    setSelectedTeam({ label: '', value: '' });
    fetchTeam(selectedTeam.value).then((data) => {
      setSelectedTeam({
        label: data.name,
        value: data.uid,
        logo: data?.logo?.url ?? null,
      });
    });
  };

  const updateMemberAutocomplete = () => {
    fetchMember(selectedMember.value).then((data) => {
      setSelectedMember({ label: '', value: '' });
      setSelectedMember({
        label: data.name,
        value: data.uid,
        logo: data?.image?.url,
        externalId: data?.externalId
      });
    });
  };

  const updateDropdown = () => {
    fetchMember(userInfo.uid).then((data) => {
      if (userInfo?.leadingTeams?.length) {
        const teamsDropdownValues = userInfo?.leadingTeams?.map((teamUid) => {
          const filteredTeam = data?.teamMemberRoles.filter((teamObj) => {
            return teamObj?.team?.uid === teamUid;
          });
          if (filteredTeam && filteredTeam.length) {
            if (selectedTeam.value === filteredTeam[0].team.uid) {
              setSelectedTeam({
                label: filteredTeam[0].team.name,
                value: filteredTeam[0].team.uid,
                icon: filteredTeam[0]?.team?.logo?.url ?? null,
              });
            }
            return {
              label: filteredTeam[0].team.name,
              value: filteredTeam[0].team.uid,
              icon: filteredTeam[0]?.team?.logo?.url ?? null,
            };
          }
        });
        setteamsDropdown(teamsDropdownValues);
      }
    });
  };

  const breadcrumbItems: [any] = [
    {
      href: `members/`,
      label: `Members`,
    },
  ];
  breadcrumbItems.push({
    href: `members/${userInfo.uid}`,
    label: `${userInfo?.name}`,
  });

  let sidemenu = [SETTINGS_CONSTANTS.PROFILE_SETTINGS, SETTINGS_CONSTANTS.PRIVACY];

  let adminSideMenu = [];

  if (userInfo?.roles.length && userInfo?.roles.includes(ADMIN_ROLE)) {
    adminSideMenu = [...adminSideMenu, SETTINGS_CONSTANTS.MEMBER_SETTINGS, SETTINGS_CONSTANTS.TEAM_SETTINGS];
  } else if (userInfo?.leadingTeams?.length) {
    adminSideMenu = [...adminSideMenu, SETTINGS_CONSTANTS.TEAM_SETTINGS];
  }

  if (activeSetting) {
    breadcrumbItems.push({ label: activeSetting });
  } else {
    breadcrumbItems.push({ label: SETTINGS_CONSTANTS.PROFILE_SETTINGS });
    setActiveSetting(SETTINGS_CONSTANTS.PROFILE_SETTINGS);
  }

  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [targetSettings, setTargetSetting] = useState(SETTINGS_CONSTANTS.PROFILE_SETTINGS);

  function handleSettingsMenu(menu) {
    setTargetSetting(menu);
    if (menu === SETTINGS_CONSTANTS.PROFILE_SETTINGS) {
      if (beforeChangeMemberValidation() || beforeChangeValidation() || state.privacyModifiedFlag) {
        setOpenValidationPopup(true);
      } else {
        trackGoal(FATHOM_EVENTS.directory.settingCategory.profile, 0);
        setActiveSetting(SETTINGS_CONSTANTS.PROFILE_SETTINGS);
      }
    } else if (menu === SETTINGS_CONSTANTS.TEAM_SETTINGS) {
      // setSelectedTeam(teamsDropdown[0]); //to always set first data
      if (isProfileChanged() || beforeChangeMemberValidation() || state.privacyModifiedFlag) {
        setOpenValidationPopup(true);
      } else {
        trackGoal(FATHOM_EVENTS.directory.settingCategory.team, 0);
        setActiveSetting(SETTINGS_CONSTANTS.TEAM_SETTINGS);
      }
    } else if (menu === SETTINGS_CONSTANTS.MEMBER_SETTINGS) {
      // setSelectedMember(membersDropdown[0]);
      if (isProfileChanged() || beforeChangeValidation() || state.privacyModifiedFlag) {
        setOpenValidationPopup(true);
      } else {
        trackGoal(FATHOM_EVENTS.directory.settingCategory.member, 0);
        setActiveSetting(SETTINGS_CONSTANTS.MEMBER_SETTINGS);
      }
    } else if (menu === SETTINGS_CONSTANTS.PRIVACY) {
      if (isProfileChanged() || beforeChangeMemberValidation() || beforeChangeValidation()) {
        setOpenValidationPopup(true);
      } else {
        setActiveSetting(SETTINGS_CONSTANTS.PRIVACY);
        trackGoal(FATHOM_EVENTS.directory.settingCategory.member, 0);
      }
    }
  }

  const handleTeamChange = (selectedValue) => {
    setSelectedTeam(selectedValue);
  };

  const beforeChangeValidation = (Selected?) => {
    return isModified;
  };

  const beforeChangeMemberValidation = (Selected?) => {
    return isModifiedMember;
  };

  const isProfileChanged = () => {
    return isPflModified;
  };

  function handleMemberChange(selectedValue) {
    setSelectedMember(selectedValue);
  }

  const fetchTeamsWithLogoSearchTerm = async (searchTerm) => {
    try {
      const response = await api.get(
        `/v1/teams?name__istartswith=${searchTerm}&select=uid,name,shortDescription,logo.url,industryTags.title`
      );
      if (response.data) {
        return response.data.map((item) => {
          return { value: item.uid, label: item.name, logo: item?.logo?.url ? item.logo.url : null };
        });
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchMembersWithLogoSearchTerm = async (searchTerm) => {
    try {
      const response = await api.get(
        `/v1/members?name__istartswith=${searchTerm}&select=uid,name,image,externalId&orderBy=name,asc`
      );
      if (response.data) {
        return response.data
          .filter((item) => item?.uid !== userInfo?.uid)
          .map((item) => {
            return { value: item.uid, externalId: item.externalId, label: item.name, logo: item?.image?.url ? item.image.url : null };
          });
      }
    } catch (error) {
      console.error(error);
    }
  };

  const getAutoCompleteComponent = (name) => {
    if (name === SETTINGS_CONSTANTS.MEMBER) {
      return (
        <Autocomplete
          name={SETTINGS_CONSTANTS.MEMBER}
          className="custom-grey custom-outline-none border"
          required={true}
          placeholder="Select a member"
          key={selectedMember.label}
          selectedOption={selectedMember}
          onSelectOption={handleMemberChange}
          debounceCall={fetchMembersWithLogoSearchTerm}
          validateBeforeChange={true}
          validationFnBeforeChange={beforeChangeMemberValidation}
          confirmationMessage={MSG_CONSTANTS.CHANGE_CONF_MSG}
        />
      );
    } else if (name === SETTINGS_CONSTANTS.TEAM) {
      return (
        <Autocomplete
          name={SETTINGS_CONSTANTS.TEAM}
          className="custom-grey custom-outline-none border"
          required={true}
          key={selectedTeam.label}
          placeholder="Select a team"
          selectedOption={selectedTeam}
          onSelectOption={handleTeamChange}
          debounceCall={fetchTeamsWithLogoSearchTerm}
          validateBeforeChange={true}
          validationFnBeforeChange={beforeChangeValidation}
          confirmationMessage={MSG_CONSTANTS.CHANGE_CONF_MSG}
        />
      );
    }
  };

  const getDropdownComponent = () => {
    return (
      <Dropdown
        name="team"
        required={true}
        options={teamsDropdownOptions}
        initialOption={selectedTeam}
        onChange={handleTeamChange}
        placeholder="Select a Team"
        className="custom-grey custom-outline-none border"
        value={selectedTeam}
        validateBeforeChange={true}
        validationFn={beforeChangeValidation}
        confirmationMessage={MSG_CONSTANTS.CHANGE_CONF_MSG}
      />
    );
  };

  const getTeamComponent = () => {
    return (
      <EditTeamModal
        isOpen={true}
        setIsModalOpen={setIsTeamModalOpen}
        id={selectedTeam.value}
        fromSettings={true}
        setModified={setModified}
        setRefreshTeamAutocomplete={setRefreshTeamAutocomplete}
      />
    );
  };

  const getMemberComponent = (settings) => {
    if (settings === SETTINGS_CONSTANTS.MEMBER_SETTINGS) {
      return (
        <EditMemberModal
          isOpen={true}
          setIsModalOpen={() => null}
          id={selectedMember?.value}
          externalId={selectedMember?.externalId}
          isProfileSettings={true}
          isUserProfile={false}
          setModified={setModifiedMember}
          setRefreshMemberAutocomplete={setRefreshMemberAutocomplete}
          userInfo={userInfo}
          tabSelection={tabSelection}
        />
      );
    } else if (settings === SETTINGS_CONSTANTS.PROFILE_SETTINGS) {
      return (
        <EditMemberModal
          isOpen={false}
          setIsModalOpen={() => null}
          id={userInfo?.uid}
          isProfileSettings={true}
          isUserProfile={true}
          tabSelection={tabSelection}
          authLinkedAccounts={authAccounts}
          setModified={setModifiedProfile}
        />
      );
    }
  };

  const confirmationOnProfileClose = (flag: boolean) => {
    setOpenValidationPopup(false);
    if (flag) {
      if (activeSetting === SETTINGS_CONSTANTS.PROFILE_SETTINGS) {
        setModifiedProfile(false);
        dispatch({ type: 'SET_PRIVACY_MODIFIED', payload: false });
      } else if (activeSetting === SETTINGS_CONSTANTS.TEAM_SETTINGS) {
        setModified(false);
      } else if (activeSetting === SETTINGS_CONSTANTS.MEMBER_SETTINGS) {
        setModifiedMember(false);
      } else if (activeSetting === SETTINGS_CONSTANTS.PRIVACY) {
        dispatch({ type: 'SET_PRIVACY_MODIFIED', payload: false });
      }
      setActiveSetting(targetSettings);
    }
  };

  function getSettingComponent(userInfo) {
    switch (activeSetting) {
      case SETTINGS_CONSTANTS.TEAM_SETTINGS:
        return (
          <>
            <div>
              <div className="inline-block text-[32px] font-bold">{SETTINGS_CONSTANTS.TEAM_SETTINGS}</div>
              <div className="float-right inline-block w-[227px]">
                {userInfo?.roles?.length && userInfo.roles.includes(ADMIN_ROLE)
                  ? getAutoCompleteComponent(SETTINGS_CONSTANTS.TEAM)
                  : getDropdownComponent()}
              </div>
            </div>
            {selectedTeam && getTeamComponent()}
          </>
        );
      case SETTINGS_CONSTANTS.PROFILE_SETTINGS:
        return (
          <>
            <div className="text-[32px] font-bold">{SETTINGS_CONSTANTS.PROFILE_SETTINGS}</div>
            {getMemberComponent(SETTINGS_CONSTANTS.PROFILE_SETTINGS)}
          </>
        );
      case SETTINGS_CONSTANTS.MEMBER_SETTINGS:
        return (
          <>
            <div>
              <div className="inline-block text-[32px] font-bold">{SETTINGS_CONSTANTS.MEMBER_SETTINGS}</div>
              <div className="float-right inline-block w-[227px]">
                {getAutoCompleteComponent(SETTINGS_CONSTANTS.MEMBER)}
              </div>
            </div>
            {getMemberComponent(SETTINGS_CONSTANTS.MEMBER_SETTINGS)}
          </>
        );
      case SETTINGS_CONSTANTS.PRIVACY:
        return (
          <>
            <div>
              <div className="inline-block text-[32px] font-bold">{SETTINGS_CONSTANTS.PRIVACY}</div>
              <Privacy from={SETTINGS_CONSTANTS.PRIVACY} />
            </div>
          </>
        );
      default:
        return (
          <>
            <div className="text-[32px] font-bold">{SETTINGS_CONSTANTS.PROFILE_SETTINGS}</div>
            {getMemberComponent(SETTINGS_CONSTANTS.PROFILE_SETTINGS)}
          </>
        );
    }
  }

  const getAdminMenuTemplate = () => {
    return (
      adminSideMenu &&
      adminSideMenu.length > 0 && (
        <div className="relative top-[23px]">
          <div className="pb-[8px] text-[13px] font-semibold opacity-40">{SETTINGS_CONSTANTS.ADMIN_SETTINGS}</div>
          <div className="flex w-[256px] flex-col items-start justify-center rounded-[8px] border border-[#CBD5E1] bg-[#FFFFFF]">
            {adminSideMenu.map((menu) => {
              return (
                <div
                  key={menu}
                  className={`flex h-[48px] w-full cursor-pointer items-center rounded-[8px] pt-[8px] pb-[8px] pr-[24px] pl-[24px] hover:bg-[#F1F5F9] ${
                    activeSetting === menu ? 'bg-[#F1F5F9] font-semibold ' : 'font-normal'
                  }`}
                  onClick={() => handleSettingsMenu(menu)}
                >
                  {menu}
                </div>
              );
            })}
          </div>
        </div>
      )
    );
  };

  return (
    <>
      <NextSeo {...DIRECTORY_SEO} title={userInfo.name} />
      <Breadcrumb items={breadcrumbItems} classname="max-w-[150px] truncate" />

      <SettingsContext.Provider value={{ state, dispatch }}>
        <div className="h-full w-full">
          <div className="grid grid-cols-4 gap-x-8 pt-40">
            <div className="col-span-1">
              {
                <div className="relative top-[23px] float-right">
                  <div>
                    <div className="pb-[8px] text-[13px] font-semibold opacity-40">
                      {SETTINGS_CONSTANTS.ACCOUNT_SETTINGS}
                    </div>
                    <div className="flex w-[256px] flex-col items-start justify-center rounded-[8px] border border-[#CBD5E1] bg-[#FFFFFF]">
                      {sidemenu &&
                        sidemenu.map((menu) => {
                          return (
                            <div
                              key={menu}
                              className={`flex h-[48px] w-full cursor-pointer items-center rounded-[8px] pt-[8px] pb-[8px] pr-[24px] pl-[24px] hover:bg-[#F1F5F9] ${
                                activeSetting === menu ? 'bg-[#F1F5F9] font-semibold ' : 'font-normal'
                              }`}
                              onClick={() => handleSettingsMenu(menu)}
                            >
                              {menu}
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {getAdminMenuTemplate()}
                </div>
              }
            </div>
            <div className="col-span-2">{getSettingComponent(userInfo)}</div>
          </div>
          <DiscardChangesPopup
            text={MSG_CONSTANTS.CHANGE_CONF_MSG}
            isOpen={openValidationPopup}
            onCloseFn={confirmationOnProfileClose}
          />
        </div>
      </SettingsContext.Provider>
    </>
  );
}

Settings.getLayout = function getLayout(page: ReactElement) {
  return <DirectoryLayout>{page}</DirectoryLayout>;
};

export const getServerSideProps = async (ctx) => {
  const { res, req, query } = ctx;
  let cookies = req?.cookies;
  if (!cookies?.authToken) {
    await renewAndStoreNewAccessToken(cookies?.refreshToken, ctx);
    if (ctx.res.getHeader('Set-Cookie')) cookies = convertCookiesToJson(ctx.res.getHeader('Set-Cookie'));
  }
  const userInfo = cookies?.userInfo ? JSON.parse(cookies?.userInfo) : {};
  const isUserLoggedIn = cookies?.authToken && cookies?.userInfo ? true : false;

  let memberSelected = null;
  let teamSelected = null;
  let settingCategory = '';
  if (query?.id && query?.from) {
    if (query?.from === SETTINGS_CONSTANTS.TEAM) {
      settingCategory = SETTINGS_CONSTANTS.TEAM_SETTINGS;
      teamSelected = {
        label: query.name,
        value: query.id,
        logo: query.logo ? query.logo : null,
        icon: query.logo ? query.logo : null,
      };
    } else if (query.from === SETTINGS_CONSTANTS.MEMBER) {
      if (query.id === userInfo.uid) {
        settingCategory = SETTINGS_CONSTANTS.PROFILE_SETTINGS;
      } else {
        settingCategory = SETTINGS_CONSTANTS.MEMBER_SETTINGS;
        memberSelected = {
          label: query.name,
          value: query.id,
          logo: query.logo ?? null,
        };
      }
    }
  }

  if (!userInfo?.uid) {
    setCookie(ctx, 'page_params', 'user-logged-out', {
      path: '/',
      maxAge: Math.floor(Date.now() / 1000) + 60,
    });
    return {
      redirect: {
        permanent: false,
        destination: PAGE_ROUTES.TEAMS,
      },
    };
  }

  let teamsDropdown = [];
  let membersDropdown = [];

  const memberResponse = await getMember(userInfo.uid);

  let member;
  if (memberResponse.status === 200) {
    member = memberResponse.body;
  }
  if (!member) {
    teamsDropdown = null;
    membersDropdown = null;
    return {
      notFound: true,
    };
  } else {
    if (userInfo?.roles?.includes(ADMIN_ROLE)) {
      const allTeamsResponse = await getTeams({ select: 'uid,name,shortDescription,logo.url,industryTags.title' });
      if (allTeamsResponse.status === 200) {
        teamsDropdown = [];
        if (allTeamsResponse.body && allTeamsResponse.body.length) {
          teamsDropdown.push({
            label: allTeamsResponse.body[0].name,
            value: allTeamsResponse.body[0].uid,
            logo: allTeamsResponse.body[0]?.logo?.url ?? null,
          });
        }
      }
      const allMembersResponse = await getMembers({ select: 'uid,name,image', orderBy: 'name,asc' });
      if (allMembersResponse.status === 200) {
        membersDropdown = [];
        if (allMembersResponse.body && allMembersResponse.body.length) {
          const filteredMembers = allMembersResponse.body.filter((item) => item.uid !== userInfo?.uid);
          membersDropdown.push({
            label: filteredMembers[0].name,
            value: filteredMembers[0].uid,
            logo: filteredMembers[0]?.image?.url ?? null,
          });
        }
      }
    } else if (userInfo?.leadingTeams?.length) {
      teamsDropdown = userInfo?.leadingTeams?.map((teamUid) => {
        const filteredTeam = member?.teamMemberRoles.filter((teamObj) => {
          return teamObj?.team?.uid === teamUid;
        });
        if (filteredTeam && filteredTeam.length) {
          return {
            label: filteredTeam[0].team.name,
            value: filteredTeam[0].team.uid,
            icon: filteredTeam[0]?.team?.logo?.url ?? null,
          };
        }
      });
    } else {
      teamsDropdown = null;
      membersDropdown = null;
    }
  }

  let preferences = null;
  const authLinkedAccounts = cookies.authLinkedAccounts ? JSON.parse(cookies.authLinkedAccounts) : '';
  if (cookies?.authToken) {
    try {
      let memberPreferences = await getMemberPreferences(userInfo.uid, cookies.authToken);
      if (memberPreferences.status === 200) {
        if (memberPreferences.body?.['size'] === 0) {
          preferences = JSON.parse(JSON.stringify(PRIVACY_CONSTANTS.DEFAULT_SETTINGS));
        } else {
          preferences = memberPreferences.body;
        }
        //   hidePreferences(preferences, member);
      }
    } catch (err) {
      console.log(err);
    }
  }

  res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate');
  return {
    props: {
      isUserLoggedIn,
      userInfo,
      teamsDropdown,
      membersDropdown,
      teamSelected,
      memberSelected,
      settingCategory,
      preferences,
      authLinkedAccounts,
      tabSelection: query?.tab ?? '',
    },
  };
};
