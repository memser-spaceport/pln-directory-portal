import { getMember, getMembers } from "@protocol-labs-network/members/data-access";
import { getTeams } from "@protocol-labs-network/teams/data-access";
import { Autocomplete, Breadcrumb, Dropdown } from "@protocol-labs-network/ui";
import { EditMemberModal } from "apps/web-app/components/members/member-enrollment/editmember";
import { EditTeamModal } from "apps/web-app/components/teams/team-enrollment/editteam";
import { ADMIN_ROLE, PAGE_ROUTES, SETTINGS_CONSTANTS } from "apps/web-app/constants";
import { useProfileBreadcrumb } from "apps/web-app/hooks/profile/use-profile-breadcrumb.hook";
import { DirectoryLayout } from "apps/web-app/layouts/directory-layout";
import { DIRECTORY_SEO } from "apps/web-app/seo.config";
import api from "apps/web-app/utils/api";
import { NextSeo } from "next-seo";
import { useRouter } from "next/router";
import { setCookie } from "nookies";
import { ReactElement, useEffect, useState } from "react";


export default function Settings({
    backLink,
    userInfo, teamsDropdown, membersDropdown }) {

    const [activeSetting, setActiveSetting] = useState(SETTINGS_CONSTANTS.PROFILE_SETTINGS);
    const [selectedTeam, setSelectedTeam] = useState(teamsDropdown.length ? teamsDropdown[0] : null);
    const [selectedMember, setSelectedMember] = useState(membersDropdown.length ? membersDropdown[0] : null);
    const router = useRouter();

    useEffect(() => {
        console.log(router.query.from)
        if(router.query?.id && router.query?.from){
            if(router.query?.from === SETTINGS_CONSTANTS.TEAM){
                setActiveSetting(SETTINGS_CONSTANTS.TEAM_SETTINGS);
                setSelectedTeam({
                    "label": router.query.name,
                    "value": router.query.id,
                    "icon":  router.query.logo
                })
            }else if(router.query.from === SETTINGS_CONSTANTS.MEMBER){
                setActiveSetting(SETTINGS_CONSTANTS.MEMBER_SETTINGS);
                setSelectedMember({
                    "label": router.query.name,
                    "value": router.query.id,
                    "icon":  router.query.logo
                })
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

    function handleSettingsMenu(menu) {
        if (menu === SETTINGS_CONSTANTS.PROFILE_SETTINGS) {
            setActiveSetting(SETTINGS_CONSTANTS.PROFILE_SETTINGS);
        } else if (menu === SETTINGS_CONSTANTS.TEAM_SETTINGS) {
            setSelectedTeam(teamsDropdown[0]);
            setActiveSetting(SETTINGS_CONSTANTS.TEAM_SETTINGS);
        } else if (menu === SETTINGS_CONSTANTS.MEMBER_SETTINGS){
            setSelectedMember(membersDropdown[0]);
            setActiveSetting(SETTINGS_CONSTANTS.MEMBER_SETTINGS);
        }
    }

    function handleTeamChange(selectedValue) {
        setSelectedTeam(selectedValue);
    }

    function handleMemberChange(selectedValue) {
        setSelectedMember(selectedValue);
    }

    const fetchTeamsWithLogoSearchTerm = async (searchTerm) => {
        try {
          const response = await api.get(`/v1/teams?name__istartswith=${searchTerm}&select=uid,name,shortDescription,logo.url,industryTags.title`);
          if (response.data) {
            console.log(response.data)
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
            console.log(response.data)
            return response.data.map((item) => {
              return { value: item.uid, label: item.name, logo:item?.image?.url };
            });
          }
        } catch (error) {
          console.error(error);
        }
    };

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
                                        (<Autocomplete
                                            name="team"
                                            className="custom-grey custom-outline-none border"
                                            required={true}
                                            placeholder="Select a team"
                                            selectedOption={selectedTeam}
                                            onSelectOption={handleTeamChange}
                                            debounceCall={fetchTeamsWithLogoSearchTerm}
                                        />) : <Dropdown
                                            name="team"
                                            required={true}
                                            options={teamsDropdown}
                                            initialOption={selectedTeam}
                                            onChange={handleTeamChange}
                                            placeholder="Select a Team"
                                            className="custom-grey custom-outline-none border"
                                            value={selectedTeam}
                                        />
                                    )
                                }
                            </div>
                        </div>
                        <EditTeamModal
                            isOpen={true}
                            setIsModalOpen={setIsTeamModalOpen}
                            id={selectedTeam.value}
                            fromSettings={true}
                        />
                    </>);
            case SETTINGS_CONSTANTS.PROFILE_SETTINGS:
                return (<>
                    <div className="text-[32px] font-bold">{SETTINGS_CONSTANTS.PROFILE_SETTINGS}</div>
                    <EditMemberModal
                        isOpen={false}
                        setIsModalOpen={() => { }}
                        id={userInfo?.uid}
                        isProfileSettings={true}
                    /></>);
            case SETTINGS_CONSTANTS.MEMBER_SETTINGS:
                return (
                    <>
                        <div>
                            <div className="text-[32px] font-bold inline-block">{SETTINGS_CONSTANTS.MEMBER_SETTINGS}</div>
                            <div className="w-[227px] inline-block float-right">
                                {
                                    (userInfo?.roles?.length && userInfo.roles.includes(ADMIN_ROLE) ?
                                        (<Autocomplete
                                            name="member"
                                            className="custom-grey custom-outline-none border"
                                            required={true}
                                            placeholder="Select a member"
                                            selectedOption={selectedMember}
                                            onSelectOption={handleMemberChange}
                                            debounceCall={fetchMembersWithLogoSearchTerm}
                                        />) : <Dropdown
                                            name="member"
                                            required={true}
                                            options={membersDropdown}
                                            initialOption={selectedMember}
                                            onChange={handleMemberChange}
                                            placeholder="Select a member"
                                            className="custom-grey custom-outline-none border"
                                            value={selectedMember}
                                        />
                                    )
                                }
                            </div>
                        </div>
                        <EditMemberModal
                            isOpen={true}
                            setIsModalOpen={()=>{ }}
                            id={selectedMember?.value}
                            isProfileSettings={true}
                        />
                    </>);
            default:
                return (<>
                    <div className="text-[32px] font-bold">{SETTINGS_CONSTANTS.PROFILE_SETTINGS}</div>
                    <EditMemberModal
                        isOpen={false}
                        setIsModalOpen={() => { }}
                        id={userInfo?.uid}
                        isProfileSettings={true}
                    /></>);
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
                            (teamsDropdown && (<div className="relative float-right top-[15px]">
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
            </div>
        </>
    )
}

Settings.getLayout = function getLayout(page: ReactElement) {
    return <DirectoryLayout>{page}</DirectoryLayout>;
};

export const getServerSideProps = async (ctx) => {
    const { res, req, query } = ctx;
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
    let memberResponse;
    
    memberResponse = await getMember(userInfo.uid)
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
                if(allTeamsResponse.body.length){
                    teamsDropdown.push(
                    {
                        "label": allTeamsResponse.body[0].name,
                        "value": allTeamsResponse.body[0].uid,
                        "logo":allTeamsResponse.body[0]?.logo?.url
                    }
                    );
                }
            }
            const allMembersResponse = await getMembers({select: 'uid,name,image', orderBy:'name,asc'});
            if (allMembersResponse.status === 200) {
                membersDropdown = [];
                if(allMembersResponse.body.length){
                    membersDropdown.push(
                    {
                        "label": allMembersResponse.body[0].name,
                        "value": allMembersResponse.body[0].uid,
                        "logo":allMembersResponse.body[0]?.image?.url
                    }
                    );
                }
            }
        } else if (userInfo?.leadingTeams?.length) {
            teamsDropdown = userInfo?.leadingTeams?.map(teamUid => {
                const filteredTeam = member.teamMemberRoles.filter(teamObj => {
                    return teamObj?.team?.uid === teamUid
                });
                if (filteredTeam.length) {
                    return {
                        "label": filteredTeam[0].team.name,
                        "value": filteredTeam[0].team.uid,
                        "icon": filteredTeam[0]?.team?.logo?.url
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
