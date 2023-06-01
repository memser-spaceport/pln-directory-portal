import { getMember, getMembers } from "@protocol-labs-network/members/data-access";
import { getTeams } from "@protocol-labs-network/teams/data-access";
import { Autocomplete, Breadcrumb, Dropdown } from "@protocol-labs-network/ui";
import { trackGoal } from 'fathom-client';
import { NextSeo } from "next-seo";
import { useRouter } from "next/router";
import { setCookie } from "nookies";
import { ReactElement, useEffect, useState } from "react";
import { EditMemberModal } from "apps/web-app/components/members/member-enrollment/editmember";
import { EditTeamModal } from "apps/web-app/components/teams/team-enrollment/editteam";
import { ADMIN_ROLE, MSG_CONSTANTS, PAGE_ROUTES, SETTINGS_CONSTANTS, FATHOM_EVENTS } from "apps/web-app/constants";
import { useProfileBreadcrumb } from "apps/web-app/hooks/profile/use-profile-breadcrumb.hook";
import { DirectoryLayout } from "apps/web-app/layouts/directory-layout";
import { DIRECTORY_SEO } from "apps/web-app/seo.config";
import api from "apps/web-app/utils/api";
import { fetchMember } from "apps/web-app/utils/services/members";
import { fetchTeam } from "apps/web-app/utils/services/teams";
import { log } from "console";
import { DiscardChangesPopup } from "libs/ui/src/lib/modals/confirmation";


export default function Settings({
    backLink,
    userInfo, teamsDropdown, membersDropdown }) {

    const [activeSetting, setActiveSetting] = useState(SETTINGS_CONSTANTS.PROFILE_SETTINGS);
    const [selectedTeam, setSelectedTeam] = useState((teamsDropdown && teamsDropdown.length) ? teamsDropdown[0] : null);
    const [teamsDropdownOptions, setteamsDropdown] = useState(teamsDropdown ? teamsDropdown : null);
    const [selectedMember, setSelectedMember] = useState((membersDropdown && membersDropdown.length) ? membersDropdown[0] : null);
    const [isModified, setModified] = useState<boolean>(false);
    const [isTeamImageModified, setTeamImageModified] = useState<boolean>(false);
    const [isModifiedMember, setModifiedMember] = useState<boolean>(false);
    const [isPflModified, setModifiedProfile] = useState<boolean>(false);
    const [openValidationPopup, setOpenValidationPopup] = useState<boolean>(false);

    const router = useRouter();

    useEffect(() => {
        if (isTeamImageModified) {
            if(userInfo?.roles.length && userInfo?.roles.includes(ADMIN_ROLE)){
                updateTeamAutocomplete();
            } else if (userInfo?.leadingTeams?.length) {
                updateDropdown();
            }
        }

    }, [isTeamImageModified]);

    const updateTeamAutocomplete = () => {
        setSelectedTeam({ label: '', value: '' })
        fetchTeam(selectedTeam.value).then(data => {
            setSelectedTeam({
                "label": data.name,
                "value": data.uid,
                "logo": data?.logo?.url
            });
        });
    }

    const updateDropdown = () => {
        fetchMember(userInfo.uid).then((data) => {
            if (userInfo?.leadingTeams?.length) {
                const teamsDropdownValues = userInfo?.leadingTeams?.map(teamUid => {
                    const filteredTeam = data.teamMemberRoles.filter(teamObj => {
                        return teamObj?.team?.uid === teamUid
                    });
                    if (filteredTeam && filteredTeam.length) {
                        if(selectedTeam.value === filteredTeam[0].team.uid){
                            setSelectedTeam({
                                "label": filteredTeam[0].team.name,
                                "value": filteredTeam[0].team.uid,
                                "icon": filteredTeam[0]?.team?.logo?.url ?? null
                            })
                        }
                        return {
                            "label": filteredTeam[0].team.name,
                            "value": filteredTeam[0].team.uid,
                            "icon": filteredTeam[0]?.team?.logo?.url  ?? null
                        }
                    }
                });
                setteamsDropdown(teamsDropdownValues);
            }
        })
    }

    useEffect(() => {
        if(router.query?.id && router.query?.from){
            if(router.query?.from === SETTINGS_CONSTANTS.TEAM){
                setActiveSetting(SETTINGS_CONSTANTS.TEAM_SETTINGS);
                setSelectedTeam({
                    "label": router.query.name,
                    "value": router.query.id,
                    "logo":  router.query.logo ?? null,
                    "icon":  router.query.logo ?? null
                })
            }else if(router.query.from === SETTINGS_CONSTANTS.MEMBER){
                if(router.query.id === userInfo.uid){
                    setActiveSetting(SETTINGS_CONSTANTS.PROFILE_SETTINGS);
                }else{
                    setActiveSetting(SETTINGS_CONSTANTS.MEMBER_SETTINGS);
                    setSelectedMember({
                        "label": router.query.name,
                        "value": router.query.id,
                        "logo":  router.query.logo ?? null
                    });
                }
            }
        }
      }, [router.query]);

    const { breadcrumbItems } = useProfileBreadcrumb({
        backLink,
        directoryName: 'Members',
        pageName: userInfo?.name,
    });

    let sidemenu = [
        SETTINGS_CONSTANTS.PROFILE_SETTINGS
    ]

    if(userInfo?.roles.length && userInfo?.roles.includes(ADMIN_ROLE)){
        sidemenu = [...sidemenu,SETTINGS_CONSTANTS.MEMBER_SETTINGS,SETTINGS_CONSTANTS.TEAM_SETTINGS];
    }else if(userInfo?.leadingTeams?.length){
        sidemenu = [...sidemenu,SETTINGS_CONSTANTS.TEAM_SETTINGS];
    }

    breadcrumbItems.push({ label: activeSetting });

    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
    const [targetSettings, setTargetSetting] = useState(SETTINGS_CONSTANTS.PROFILE_SETTINGS);

    function handleSettingsMenu(menu) {
        setTargetSetting(menu);
        if (menu === SETTINGS_CONSTANTS.PROFILE_SETTINGS) {
            if(beforeChangeMemberValidation() || beforeChangeValidation()){
                setOpenValidationPopup(true);
            }else{
                trackGoal(FATHOM_EVENTS.directory.settingCategory.profile, 0);
                setActiveSetting(SETTINGS_CONSTANTS.PROFILE_SETTINGS);
            }
        } else if (menu === SETTINGS_CONSTANTS.TEAM_SETTINGS) {
            // setSelectedTeam(teamsDropdown[0]); //to always set first data
            if (isProfileChanged() || beforeChangeMemberValidation()) {
                setOpenValidationPopup(true);
            }else{
                trackGoal(FATHOM_EVENTS.directory.settingCategory.team, 0);
                setActiveSetting(SETTINGS_CONSTANTS.TEAM_SETTINGS);
            }
        } else if (menu === SETTINGS_CONSTANTS.MEMBER_SETTINGS){
            // setSelectedMember(membersDropdown[0]);
            if (isProfileChanged() || beforeChangeValidation()) {
                setOpenValidationPopup(true);
            }else{
                trackGoal(FATHOM_EVENTS.directory.settingCategory.member, 0);
                setActiveSetting(SETTINGS_CONSTANTS.MEMBER_SETTINGS);
            }
        }
    }

    const handleTeamChange = (selectedValue) => {
        setSelectedTeam(selectedValue);
    }

    const beforeChangeValidation = (Selected?) => {
        return isModified;
    };

    const beforeChangeMemberValidation = (Selected?) => {
        return isModifiedMember;
    };

    const isProfileChanged = () => {
        return isPflModified;
    }

    function handleMemberChange(selectedValue) {
        setSelectedMember(selectedValue);
    }

    const fetchTeamsWithLogoSearchTerm = async (searchTerm) => {
        try {
          const response = await api.get(`/v1/teams?name__istartswith=${searchTerm}&select=uid,name,shortDescription,logo.url,industryTags.title`);
          if (response.data) {
            return response.data.map((item) => {
              return { value: item.uid, label: item.name, logo:item?.logo?.url };
            });
          }
        } catch (error) {
          console.error(error);
        }
    };

    const fetchMembersWithLogoSearchTerm = async (searchTerm) => {
        try {
          const response = await api.get(`/v1/members?name__istartswith=${searchTerm}&select=uid,name,image&orderBy=name,asc`);
          if (response.data) {
            return response.data.map((item) => {
              return { value: item.uid, label: item.name, logo:item?.image?.url };
            });
          }
        } catch (error) {
          console.error(error);
        }
    };

    const getAutoCompleteComponent = (name) => {
        if(name === SETTINGS_CONSTANTS.MEMBER){
            return (<Autocomplete
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
                confirmationMessage={MSG_CONSTANTS.MEMBER_CHANGE_CONF_MSG}
            />);
        }else if(name === SETTINGS_CONSTANTS.TEAM){
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
                    confirmationMessage={MSG_CONSTANTS.TEAM_CHANGE_CONF_MSG}
                />
            )
        }
        
    }

    const getDropdownComponent = () => {
        return (<Dropdown
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
            confirmationMessage={MSG_CONSTANTS.TEAM_CHANGE_CONF_MSG}
        />);
    }

    const getTeamComponent = () => {
        return (
            <EditTeamModal
                isOpen={true}
                setIsModalOpen={setIsTeamModalOpen}
                id={selectedTeam.value}
                fromSettings={true}
                setModified={setModified}
                setImageModified={setTeamImageModified}
            />
        );
    }

    const getMemberComponent = (settings) => {
        if (settings === SETTINGS_CONSTANTS.MEMBER_SETTINGS) {
            return (
                <EditMemberModal
                    isOpen={true}
                    setIsModalOpen={() => null}
                    id={selectedMember?.value}
                    isProfileSettings={true}
                    setModified={setModifiedMember}
                />
            )
        } else if (settings === SETTINGS_CONSTANTS.PROFILE_SETTINGS){
            return (
                <EditMemberModal
                    isOpen={false}
                    setIsModalOpen={() => null}
                    id={userInfo?.uid}
                    isProfileSettings={true}
                    setModified={setModifiedProfile}
                />
            );
        }
    }

    const confirmationOnProfileClose = (flag:boolean) => {
        setOpenValidationPopup(false);
        if(flag){
            if (activeSetting === SETTINGS_CONSTANTS.PROFILE_SETTINGS) {
                setModifiedProfile(false);
            } else if (activeSetting === SETTINGS_CONSTANTS.TEAM_SETTINGS) {
                setModified(false);
            } else if (activeSetting === SETTINGS_CONSTANTS.MEMBER_SETTINGS) {
                setModifiedMember(false);
            }
            setActiveSetting(targetSettings);
        }
    }
    

    function getSettingComponent(userInfo) {
        switch (activeSetting) {
            case SETTINGS_CONSTANTS.TEAM_SETTINGS:
                return (
                    <>
                        <div>
                            <div className="text-[32px] font-bold inline-block">{SETTINGS_CONSTANTS.TEAM_SETTINGS}</div>
                            <div className="w-[227px] inline-block float-right">
                                {
                                    (userInfo?.roles?.length && userInfo.roles.includes(ADMIN_ROLE) ?
                                        getAutoCompleteComponent(SETTINGS_CONSTANTS.TEAM) : getDropdownComponent()
                                    )
                                }
                            </div>
                        </div>
                        {
                            selectedTeam && getTeamComponent()
                        }
                    </>);
            case SETTINGS_CONSTANTS.PROFILE_SETTINGS:
                return (
                    <>
                        <div className="text-[32px] font-bold">{SETTINGS_CONSTANTS.PROFILE_SETTINGS}</div>
                        {
                            getMemberComponent(SETTINGS_CONSTANTS.PROFILE_SETTINGS)
                        }
                    </>
                );
            case SETTINGS_CONSTANTS.MEMBER_SETTINGS:
                return (
                    <>
                        <div>
                            <div className="text-[32px] font-bold inline-block">{SETTINGS_CONSTANTS.MEMBER_SETTINGS}</div>
                            <div className="w-[227px] inline-block float-right">
                                {
                                    getAutoCompleteComponent(SETTINGS_CONSTANTS.MEMBER)
                                }
                            </div>
                        </div>
                        {
                            getMemberComponent(SETTINGS_CONSTANTS.MEMBER_SETTINGS)
                        }
                    </>);
            default:
                return (<>
                    <div className="text-[32px] font-bold">{SETTINGS_CONSTANTS.PROFILE_SETTINGS}</div>
                    {
                        getMemberComponent(SETTINGS_CONSTANTS.PROFILE_SETTINGS)
                    }
                    </>);
        }
    }
    return (
        <>
            <NextSeo {...DIRECTORY_SEO} title={userInfo.name} />
            <Breadcrumb items={breadcrumbItems} />
            <div className="w-full h-full">
                <div className="grid grid-cols-4 pt-24 gap-x-8">
                    <div className="col-span-1">
                        {
                            (teamsDropdownOptions && (<div className="relative float-right top-[15px]">
                                <div className="font-semibold text-[13px] opacity-40 pb-[8px]">
                                    {SETTINGS_CONSTANTS.ACCOUNT_SETTINGS}
                                </div>
                                <div className="flex flex-col justify-center items-start w-[256px] border bg-[#FFFFFF] border-[#CBD5E1] rounded-[8px]">
                                    {
                                        sidemenu && (
                                            sidemenu.map(menu => {
                                                return (<div
                                                    key={menu}
                                                    className=
                                                    {`w-full h-[48px] flex items-center pt-[8px] pb-[8px] pr-[24px] rounded-[8px] pl-[24px] cursor-pointer hover:bg-[#F1F5F9] ${activeSetting === menu ? 'bg-[#F1F5F9] font-semibold ' : 'font-normal'}`}
                                                    onClick={() => handleSettingsMenu(menu)}>
                                                    {menu}
                                                </div>)
                                            })
                                        )
                                    }
                                </div>
                            </div>))
                        }
                    </div>
                    <div className="col-span-2">
                        {
                            getSettingComponent(userInfo)
                        }
                    </div>
                </div>
                <DiscardChangesPopup text={MSG_CONSTANTS.PROFILE_CHANGE_CONF_MSG} isOpen={openValidationPopup} onCloseFn={confirmationOnProfileClose} />
            </div>
        </>
    )
}

Settings.getLayout = function getLayout(page: ReactElement) {
    return <DirectoryLayout>{page}</DirectoryLayout>;
};

export const getServerSideProps = async (ctx) => {
    const { res, req } = ctx;
    const userInfo = req?.cookies?.userInfo ? JSON.parse(req?.cookies?.userInfo) : {};
    const isUserLoggedIn = req?.cookies?.authToken && req?.cookies?.userInfo ? true : false;

    if (!userInfo?.uid) {
        setCookie(ctx, "page_params", "user-logged-out", {
            path: '/',
            maxAge: (Math.floor(Date.now() / 1000) + 60)
        });
        return {
            redirect: {
                permanent: false,
                destination: PAGE_ROUTES.MEMBERS,
            },
        };
    }


    let teamsDropdown = [];
    let membersDropdown = [];
    
    const memberResponse = await getMember(userInfo.uid)
    let member;
    if (memberResponse.status === 200) {
        member = memberResponse.body
    }
    if (!member) {
        teamsDropdown = null;
        membersDropdown = null;
        return {
            notFound: true,
        };
    } else {
        if (userInfo?.roles?.includes(ADMIN_ROLE)){
            const allTeamsResponse = await getTeams({select: 'uid,name,shortDescription,logo.url,industryTags.title'});
            if (allTeamsResponse.status === 200) {
                teamsDropdown = [];
                if(allTeamsResponse.body && allTeamsResponse.body.length){
                    teamsDropdown.push(
                    {
                        "label": allTeamsResponse.body[0].name,
                        "value": allTeamsResponse.body[0].uid,
                        "logo":allTeamsResponse.body[0]?.logo?.url ?? null
                    }
                    );
                }
            }
            const allMembersResponse = await getMembers({select: 'uid,name,image', orderBy:'name,asc'});
            if (allMembersResponse.status === 200) {
                membersDropdown = [];
                if(allMembersResponse.body && allMembersResponse.body.length){
                    membersDropdown.push(
                    {
                        "label": allMembersResponse.body[0].name,
                        "value": allMembersResponse.body[0].uid,
                        "logo":allMembersResponse.body[0]?.image?.url ?? null
                    }
                    );
                }
            }
        } else if (userInfo?.leadingTeams?.length) {
            teamsDropdown = userInfo?.leadingTeams?.map(teamUid => {
                const filteredTeam = member.teamMemberRoles.filter(teamObj => {
                    return teamObj?.team?.uid === teamUid
                });
                if (filteredTeam && filteredTeam.length) {
                    return {
                        "label": filteredTeam[0].team.name,
                        "value": filteredTeam[0].team.uid,
                        "icon": filteredTeam[0]?.team?.logo?.url ?? null
                    }
                }
            });
        } else {
            teamsDropdown = null;
            membersDropdown = null;
        }
    }

    res.setHeader(
        'Cache-Control',
        'no-cache, no-store, max-age=0, must-revalidate'
    );

    return {
        props: { isUserLoggedIn, userInfo, teamsDropdown , membersDropdown },
    };
};
