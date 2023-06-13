import { useState } from 'react';
import { useRouter } from 'next/router';
import {
  IMember,
  MemberProfileProjectsProps,
} from '../../../../utils/members.types';
import { ProfileProjectCard } from '../../../shared/profile/profile-cards/profile-project-card';
import { ReactComponent as project_icon } from '../../../../public/assets/images/icons/project_icon.svg';
import { MemberProfileProjectsModal } from './member-projects-modal';
import { MemberEmptyProject } from './member-empty-project';
import useAppAnalytics from '../../../../hooks/shared/use-app-analytics';
import { APP_ANALYTICS_EVENTS, FATHOM_EVENTS } from '../../../../constants';
import { trackGoal } from 'fathom-client';
// import { ReactComponent as InformationCircleIcon } from '../../../../public/assets/images/icons/info_icon.svg';

interface IMemberProfileProjects {
  repositories: any;
  userInfo: any;
  member: IMember;
}

export function MemberProfileProjects({
  repositories,
  userInfo,
  member,
}: IMemberProfileProjects) {
  const {
    query: { id },
  } = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const displayRepos = repositories?.slice(0, 3) ?? [];
  const analytics = useAppAnalytics()
  // const seeAllInfoText =
  //   repositories?.length > 3
  //     ? "Click 'See All' to view all of the public repositories."
  //     : '';

  const onGithubProject = () => {
    setIsModalOpen(true)
    trackGoal(FATHOM_EVENTS.members.profile.gitHub.seeAll,0);
    analytics.captureEvent(APP_ANALYTICS_EVENTS.MEMBER_GITHUB_PROJECT_VIEW_ALL_CLICKED, {
      name: member?.name,
      uid: member?.id
    })
  }

  const onGithubItemClicked = (project) => {
    trackGoal(FATHOM_EVENTS.members.profile.gitHub.projectItem,0);
    analytics.captureEvent(APP_ANALYTICS_EVENTS.MEMBER_GITHUB_PROJECT_ITEM_CLICKED, {
      name: member?.name,
      uid: member?.id,
      projectName: project?.name,
      url: project?.url
    })
  }

  return (
    <>
      <h3 className="mb-2 mt-6 font-medium text-slate-500">
        {'Projects'} {repositories?.length > 0 && `(${repositories?.length})`}
        {repositories?.length > 3 && (
          <button
            onClick={() => onGithubProject()}
            className="float-right cursor-pointer text-blue-500 pt-0.5 pr-8"
          >
            See all
          </button>
        )}
      </h3>

      {repositories.length > 0 ? (
        <div className="max-h-96 overflow-y-auto rounded-xl shadow-[0px_0px_2px_rgba(15,23,42,0.16),0px_2px_2px_rgba(15,23,42,0.04)] focus-within:outline-none focus:outline-none focus-visible:outline-none">
          {displayRepos.map((project, i) => {
            return (
              <ProfileProjectCard
                key={`${id}.${project.name}`}
                url={project.url}
                // imageUrl={project?.url}
                avatarIcon={project_icon}
                name={project.name}
                description={project.description}
                clickHandler={() => onGithubItemClicked(project)}
              />
            );
          })}
        </div>
      ) : (
        <MemberEmptyProject profileType="member" userInfo={userInfo} member={member} />
      )}

      {/* <div className="flex pt-2">
        <div>
          <InformationCircleIcon />
        </div>
        <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
          Up to 3 pinned project repositories from member&apos;s GitHub profile
          is displayed by default. This view utilizes the same ordering (if any)
          as the pinned feature of member&apos;s GitHub profile page.{' '}
          {seeAllInfoText}
        </span>
      </div> */}
      <MemberProfileProjectsModal
        isOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        repositories={repositories}
        onItemClick={onGithubItemClicked}
      />
    </>
  );
}
