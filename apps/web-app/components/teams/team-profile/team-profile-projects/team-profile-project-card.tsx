import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import Image from 'next/image';
import { useRouter } from 'next/router';

export default function TeamProfileProjectCard({
  project,
  hasProjectsEditAccess = false,
}) {
  const router = useRouter();
  const analytics = useAppAnalytics();

  const onCardClickHandler = () => {
    analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECT_CLICKED, {
      projectUid: project.id,
      projectName: project.name,
      from: 'team-details',
    });
  };

  return (
    <a
    href={`/projects/${project.id}`}
      onClick={onCardClickHandler}
      className="flex justify-between py-[16px] pl-[16px] pr-[32px]  hover:bg-[#F8FAFC] focus-visible:outline-none"
    >
      <div className="flex ">
        <div className="relative h-[41px] w-[41px]">
          <Image
            src={project.image}
            alt="project image"
            width={41}
            height={41}
            className="rounded"
          />
        </div>
        <div className="pl-4">
          <div className="flex items-center gap-[10px] text-[14px] font-semibold">
            <p className="max-w-[500px] overflow-hidden">{project?.name}</p>
            {project?.isMaintainingProject && (
              <div
                className="relative  flex h-[20px] w-[20px] shrink-0 rounded-full"
                title="Maintainer"
              >
                <Image
                  src="/assets/images/icons/projects/core.svg"
                  alt="maintainer image"
                  width={20}
                  height={20}
                  className="rounded"
                />
              </div>
            )}

            {project.fundingNeeded && (
              <div className="mx-1 flex rounded-[24px] bg-[#FFEAC1] px-[8px] text-[12px] text-[#D87705]">
                <Image
                  src={'/assets/images/icons/projects/funding.svg'}
                  alt="project image"
                  width={12}
                  height={12}
                />
                <div className="px-1">Raising Funds</div>
              </div>
            )}
          </div>
          <div className="text-[12px]">{project.tagline}</div>
        </div>
      </div>
      <div className="my-auto flex gap-2 items-center">
        {/* Edit and pin */}
        {hasProjectsEditAccess && !project?.isDeleted && (
          <button
            className="cursor-pointer z-10"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              analytics.captureEvent(
                APP_ANALYTICS_EVENTS.PROJECT_EDIT_CLICKED,
                {
                  from: 'teams-details',
                  projectId: project.id,
                }
              );
              router.push(`/projects/update/${project.id}`);
            }}
          >
            <Image
              src="/assets/images/icons/projects/edit-project.svg"
              alt="project image"
              width={24}
              height={24}
            />
          </button>
        )}
        <div className="cursor-pointer">
          <Image
            src="/assets/images/icons/projects/more-details.svg"
            alt="project image"
            width={16}
            height={16}
          />
        </div>
      </div>
    </a>
  );
}
