import { AnimatedArrowLink } from '../../animated-arrow-link/animated-arrow-link';
import { EventCard } from '../../event-card/event-card';

export const LabWeek = () => {
  return (
    <section className="text-left sm:text-center">
      <div className="sm:mb-18 mb-6">
        <h2 className="text-4xl font-bold leading-[46px] sm:text-5xl sm:leading-[60px]">
          LabWeek22
        </h2>
        <p className="text-[16px] leading-6 text-slate-600 sm:mx-auto sm:mt-2 sm:w-1/2 sm:text-lg">
          The Protocol Labs Network is gathering in Lisbon for our first ever
          decentralized conference.
        </p>
      </div>
      <div className="sm:gap-x-7.5 flex flex-col gap-6 sm:mt-2 sm:flex-row">
        <div className="h-[350px] grow">
          <EventCard
            imageURL="/assets/images/portal/pl-summit.png"
            topic="Topic"
            eventTitle="PL Summit"
            eventDetails="Lisbon, Oct. 24"
          />
        </div>

        <div className="h-[350px] grow">
          <EventCard
            imageURL="/assets/images/portal/ipfs-camp.png"
            topic="Topic"
            eventTitle="IPFS Camp"
            eventDetails="Lisbon, Oct. 28"
          />
        </div>

        <div className="h-[350px] grow">
          <EventCard
            imageURL="/assets/images/portal/fil-lisbon.png"
            topic="Topic"
            eventTitle="FIL Lisbon"
            eventDetails="Lisbon, Oct. 31"
          />
        </div>
      </div>

      <div className="mt-6 mr-3 flex sm:mt-5 sm:justify-end">
        <AnimatedArrowLink
          url="https://22.labweek.io/#schedule"
          label="See full event schedule"
        />
      </div>
    </section>
  );
};
