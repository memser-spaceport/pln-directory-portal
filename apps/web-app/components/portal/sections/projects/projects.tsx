import { ProjectCard } from './project-card';

const projects = [
  {
    imgUrl: '/assets/images/icons/launchpad.png',
    title: 'Launchpad',
    description:
      "Use Protocol Lab's industry-learning onboarding program, Launchpad, to train your new talent and hire unmatched recruits.",
    buttonUrl: 'https://pl-launchpad.io/',
    buttonLabel: 'Learn more',
  },
  {
    imgUrl: '/assets/images/icons/mosaia.png',
    title: 'Mosaia',
    description:
      'Mosaia connects you to vetted service providers that can help you, solve problems in areas such as legal, marketing, and event production',
    buttonUrl: 'https://mosaia.io/',
    buttonLabel: 'Learn more',
  },
];

export const Projects = () => {
  return (
    <div className="sm:gap-7.5 flex flex-col gap-6 sm:flex-row">
      {projects.map((project, i) => (
        <div key={i} className="sm:flex-grow sm:basis-0">
          <ProjectCard {...{ ...project }} />
        </div>
      ))}
    </div>
  );
};
