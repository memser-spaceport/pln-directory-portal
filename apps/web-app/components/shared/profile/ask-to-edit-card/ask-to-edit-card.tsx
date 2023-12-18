import { PencilAltIcon } from '@heroicons/react/outline';
import { trackGoal } from 'fathom-client';
import { useEffect, useState } from 'react';
import { APP_ANALYTICS_EVENTS, FATHOM_EVENTS, SETTINGS_CONSTANTS } from '../../../../constants';
import { EditMemberModal } from '../../../members/member-enrollment/editmember';
import { EditTeamModal } from '../../../teams/team-enrollment/editteam';
import { RequestPending } from '../../request-pending/request-pending';
import { requestPendingCheck } from '../../../../utils/services/members';
import { editTeamRequestPendingCheck } from '../../../../utils/services/teams';
import { IMember } from '../../../../utils/members.types';
import { ITeam } from '../../../../utils/teams.types';
import { ReactComponent as EditIcon } from '/public/assets/images/icons/edit.svg';
import { Router, useRouter } from 'next/router';
import Cookies from 'js-cookie';
import useAppAnalytics from '../../../../hooks/shared/use-app-analytics';
import { cookiePrefix } from "../../../../utils/common.utils";
// import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';

type TAskToEditProfileType = 'team' | 'member';

interface AskToEditCardProps {
  profileType: TAskToEditProfileType;
  member?: IMember;
  team?: ITeam;
  userInfo?: any;
  from?:string;
}

const urlList: {
  [type in TAskToEditProfileType]: { url: string; eventCode: string };
} = {
  team: {
    url: 'https://airtable.com/shruMa5sP6lUOUsBd',
    eventCode: FATHOM_EVENTS.teams.profile.requestToEdit,
  },
  member: {
    url: 'https://airtable.com/shrjg4lTu61AIMhmL',
    eventCode: FATHOM_EVENTS.members.profile.requestToEdit,
  },
};

export function AskToEditCard({
  profileType,
  member,
  team,
  userInfo,
  from
}: AskToEditCardProps) {
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isPendingRequestModalOpen, setIsPendingRequestModalOpen] =
    useState(false);

  const router = useRouter();
  const analytics = useAppAnalytics();
  const handleOpenEditModal = async () => {
    // if (
    //   typeof document !== 'undefined' &&
    //   document.getElementsByClassName('grecaptcha-badge').length
    // ) {
    //   document
    //     .getElementsByClassName('grecaptcha-badge')[0]
    //     .classList.add('width-full');
    // }
    urlList[profileType].eventCode &&
      trackGoal(urlList[profileType].eventCode, 0);
    if (profileType == 'team') {
      // const res = await editTeamRequestPendingCheck(team.name, team.id);
      setIsTeamModalOpen(true);
    } else {
      // const res = await requestPendingCheck(member.email, member.id);
      setIsMemberModalOpen(true);
    }
  };

  const logPosthogAnalytics = () => {
    try {
      const loggedInUser = Cookies.get(`${cookiePrefix()}userInfo`);
      if(loggedInUser) {
        const parsedLoggedInUser = JSON.parse(loggedInUser);
        const isAdmin = parsedLoggedInUser.roles.includes('DIRECTORYADMIN');
        const isTeamLead = parsedLoggedInUser?.leadingTeams?.includes(team?.id);
        const isSelfEdit = parsedLoggedInUser?.uid === member?.id;

        if(profileType === 'member' && isSelfEdit) {
          analytics.captureEvent(
            APP_ANALYTICS_EVENTS.MEMBER_EDIT_BY_SELF,
            {
              name: member?.name,
              email: member?.email,
              uid: member?.id
            }
          );
        } else if (profileType === 'member' && isAdmin) {
          analytics.captureEvent(
            APP_ANALYTICS_EVENTS.MEMBER_EDIT_BY_ADMIN,
            {
              name: member?.name,
              email: member?.email,
              uid: member?.id
            }
          );
        } else if (profileType === 'team' && isTeamLead) {
          analytics.captureEvent(
            APP_ANALYTICS_EVENTS.TEAM_EDIT_BY_LEAD,
            {
              name: team?.name,
              uid: member?.id
            }
          );
        } else if (profileType === 'team' && isAdmin) {
          analytics.captureEvent(
            APP_ANALYTICS_EVENTS.TEAM_EDIT_BY_ADMIN,
            {
              name: team?.name,
              uid: member?.id
            }
          );
        }
      }
    } catch (error) {
      console.error(error)
    }
  }

  const redirectToSettings = () => {
    /* analytics.captureEvent(APP_ANALYTICS_EVENTS, {

    }) */
    logPosthogAnalytics()
    let query = {};
    if(profileType === SETTINGS_CONSTANTS.TEAM){
      query = { id: team.id, name: team.name, logo: team.logo, from: SETTINGS_CONSTANTS.TEAM };
    } else if(profileType === SETTINGS_CONSTANTS.MEMBER){
      query = { id: member.id, name: member.name, logo: member.image, from: SETTINGS_CONSTANTS.MEMBER };
    }
    trackGoal(urlList[profileType].eventCode, 0);
    router.push({
      pathname: '/settings',
      query
    }, '/settings');
  }

  return (
    <div>
      {/* <h3 className="flex items-center text-lg font-semibold">
        <span className="mr-3 flex h-7 w-7 items-center justify-center rounded border-[0.5px] border-slate-200 bg-slate-100">
          <PencilAltIcon className="stroke-1.5 h-4 w-4" />
        </span>
        Anything missing?
      </h3>
      <p className="mb-6 mt-4 text-base leading-6">
        As a community, help Teams and Members stay updated with their
        information.
      </p>
      {/* <Link href={urlList[profileType].url}>
        <a
          target="_blank"
          className="on-focus shadow-request-button hover:shadow-on-hover flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-medium hover:border-slate-200 hover:text-slate-600 hover:ring-2 hover:ring-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300 active:border-blue-600 active:ring-2 active:ring-blue-300"
          onClick={() =>
            urlList[profileType].eventCode &&
            trackGoal(urlList[profileType].eventCode, 0)
          }
        >
          Request to Edit
        </a>
      </Link> */}
      <button
        id="edit-detail"
        className="flex text-base font-semibold text-[#156FF7]"
        onClick={() => redirectToSettings()}
      >{
        from !="git" ? (
          <>
          <EditIcon className="m-1" />{' '}
          {profileType === 'member' ? 'Edit Profile' : 'Edit Team'}
          </>
        ): (
          <>
          here
          </>
        )
      }

      </button>
      {/* <GoogleReCaptchaProvider
        reCaptchaKey={process.env.NEXT_PUBLIC_GOOGLE_SITE_KEY}
        scriptProps={{
          async: false,
          defer: false,
          appendTo: 'head',
          nonce: undefined,
        }}
      > */}
        {member?.id && (
          <EditMemberModal
            tabSelection=""
            isOpen={isMemberModalOpen}
            setIsModalOpen={setIsMemberModalOpen}
            id={member?.id}
            userInfo={userInfo}
          />
        )}
        {team?.id && (
          <EditTeamModal
            isOpen={isTeamModalOpen}
            setIsModalOpen={setIsTeamModalOpen}
            id={team?.id}
          />
        )}
        <RequestPending
          isOpen={isPendingRequestModalOpen}
          setIsModalOpen={setIsPendingRequestModalOpen}
        />
      {/* </GoogleReCaptchaProvider> */}
    </div>
  );
}
