import { trackGoal } from 'fathom-client';
import { Card } from '../../card/card';
import { PortalButton } from '../../portal-button/portal-button';
import { ProjectIcon } from './project-icon';

type TProjectCardProps = {
  imgUrl: string;
  title: string;
  description: string;
  buttonUrl: string;
  buttonLabel: string;
  eventCode: string;
};

export const ProjectCard = ({
  imgUrl,
  title,
  description,
  buttonUrl,
  buttonLabel,
  eventCode,
}: TProjectCardProps) => {
  return (
    <Card styleClassName="bg-gradient-to-b to-transparent from-white">
      <div className="mb-4">
        <ProjectIcon imageFile={imgUrl} alt={`${title} logo`} />
      </div>
      <p className="text-2xl font-semibold">{title}</p>
      <p className="mt-2 text-lg text-slate-600">{description}</p>
      <div className="mt-8">
        <PortalButton
          url={buttonUrl}
          label={buttonLabel}
          handleOnClick={() => eventCode && trackGoal(eventCode, 0)}
        />
      </div>
    </Card>
  );
};
