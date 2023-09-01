import { FATHOM_EVENTS } from '../../../../constants';
import { ProjectCard } from './project-card';

const projects = [
  {
    imgUrl: '/assets/images/icons/launchpad.png',
    title: 'Launchpad',
    description:
      "Use Protocol Lab's industry-learning onboarding program, Launchpad, to train your new talent and hire unmatched recruits.",
    buttonUrl: 'https://pl-launchpad.io/',
    buttonLabel: 'Learn more',
    eventCode: FATHOM_EVENTS.portal.launchpad.learnMore,
  },
  {
    imgUrl: '/assets/images/icons/mosaia.png',
    title: 'Mosaia',
    description:
      'Mosaia connects you to vetted service providers that can help you, solve problems in areas such as legal, marketing, and event production',
    buttonUrl: 'https://pln.mosaia.io/',
    buttonLabel: 'Learn more',
    eventCode: FATHOM_EVENTS.portal.mosaia.learnMore,
  },
];

export const Projects = () => {
  return (
    <div className="md:gap-7.5 flex flex-col gap-[24px] md:flex-row bg-[#F8FAFC] rounded-[8px] p-[24px]">
      {projects.map((project, i) => (
        <div key={i} className="md:flex-grow md:basis-0">
          <ProjectCard {...{ ...project }} />
        </div>
      ))}
    </div>
  );
};
