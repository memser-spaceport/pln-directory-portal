import { getMember } from "@protocol-labs-network/members/data-access";
import { getTeams } from "@protocol-labs-network/teams/data-access";
import { Breadcrumb, Dropdown } from "@protocol-labs-network/ui";
import { EditMemberModal } from "apps/web-app/components/members/member-enrollment/editmember";
import { EditTeamModal } from "apps/web-app/components/teams/team-enrollment/editteam";
import { ADMIN_ROLE, PAGE_ROUTES, SETTINGS_CONSTANTS } from "apps/web-app/constants";
import { useProfileBreadcrumb } from "apps/web-app/hooks/profile/use-profile-breadcrumb.hook";
import { DirectoryLayout } from "apps/web-app/layouts/directory-layout";
import { DIRECTORY_SEO } from "apps/web-app/seo.config";
import { parseMember } from "apps/web-app/utils/members.utils";
import { parseTeam } from "apps/web-app/utils/teams.utils";
import { NextSeo } from "next-seo";
import { setCookie } from "nookies";
import { ReactElement, useState } from "react";

export default function Settings({ id,
    backLink,
    userInfo,
    member, teamsDropdown }) {

    const [activeSetting, setActiveSetting] = useState(SETTINGS_CONSTANTS.PROFILE_SETTINGS);
    const [selectedTeam, setSelectedTeam] = useState(teamsDropdown[0]);

    const { breadcrumbItems } = useProfileBreadcrumb({
        backLink,
        directoryName: 'Members',
        pageName: userInfo?.name,
    });

    const sidemenu = [
        'Profile Settings',
        'Team Settings'
    ]

    breadcrumbItems.push({ label: activeSetting });

    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);

    function handleSettingsMenu(menu) {
        if (menu === SETTINGS_CONSTANTS.PROFILE_SETTINGS) {
            setActiveSetting(SETTINGS_CONSTANTS.PROFILE_SETTINGS);
        } else if (menu === SETTINGS_CONSTANTS.TEAM_SETTINGS) {
            setActiveSetting(SETTINGS_CONSTANTS.TEAM_SETTINGS);
        }
    }

    function handleTeamChange(selectedValue) {
        setSelectedTeam(selectedValue);
    }

    function getSettingComponent() {

        switch (activeSetting) {
            case SETTINGS_CONSTANTS.TEAM_SETTINGS:
                return (
                    <>
                        <div>
                            <div className="text-[32px] font-bold inline-block">{SETTINGS_CONSTANTS.TEAM_SETTINGS}</div>
                            <div className="w-[227px] inline-block float-right">
                                <Dropdown
                                    name="team"
                                    required={true}
                                    options={teamsDropdown}
                                    initialOption={selectedTeam}
                                    onChange={handleTeamChange}
                                    placeholder="Select a Team"
                                    className="custom-grey custom-outline-none border"
                                    value={selectedTeam}
                                />
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
                        <div className="pl-[60px]">
                            <div className="font-semibold text-[13px] opacity-40 pb-[8px]">
                                {SETTINGS_CONSTANTS.ACCOUNT_SETTINGS}
                            </div>
                            <div className="flex flex-col justify-center items-start w-[256px] border bg-[#FFFFFF] border-[#CBD5E1] rounded-[8px]">
                                {
                                    sidemenu && (
                                        sidemenu.map(menu => {
                                            return (<div
                                                className=
                                                {`w-full h-[48px] flex items-center pt-[8px] pb-[8px] pr-[24px] rounded-[8px] pl-[24px] cursor-pointer hover:bg-[#F1F5F9] ${activeSetting === menu ? 'bg-[#F1F5F9]' : ''}`}
                                                onClick={() => handleSettingsMenu(menu)}>
                                                {menu}
                                            </div>)
                                        })
                                    )
                                }
                            </div>
                        </div>
                    </div>
                    <div className="col-span-2">
                        {
                            getSettingComponent()
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

    const memberResponse = await getMember(userInfo?.uid, {
        with: 'image,skills,location',
    });

    let member;
    if (memberResponse.status === 200) {
        member = parseMember(memberResponse.body);
    }

    // Redirects user to the 404 page if response from
    // getMember is undefined or the member has no teams
    if (!member) {
        return {
            notFound: true,
        };
    }
    let teamResponse;
    teamResponse = await getTeams({
        'teamMemberRoles.member.uid': userInfo?.uid,
        select:
            'uid,name,logo.url,industryTags.title,teamMemberRoles.role,teamMemberRoles.mainTeam',
        pagination: false,
    })
    let team;
    if (teamResponse.status === 200) {
        team = teamResponse.body.map(parseTeam);
    }
    let teamsDropdown = [];
    if (userInfo?.leadingTeams) {
        teamsDropdown = userInfo?.leadingTeams.map(teamUid => {
            const filteredTeam = team.filter(teamObj => teamObj.id === teamUid);
            return {
                "label": filteredTeam[0].name,
                "value": filteredTeam[0].id
            }
        })
    }
    res.setHeader(
        'Cache-Control',
        'no-cache, no-store, max-age=0, must-revalidate'
    );

    return {
        props: { isUserLoggedIn, userInfo, member, teamsDropdown },
    };
};