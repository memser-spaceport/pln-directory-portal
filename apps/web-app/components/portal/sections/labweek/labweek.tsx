import { trackGoal } from 'fathom-client';
import { FATHOM_EVENTS } from '../../../../constants';

import { ArrowSmRightIcon } from '@heroicons/react/solid';
import { EventCard } from '../../event-card/event-card';

export const LabWeek = () => {
  return (
    <section className="text-left md:text-center">
      <div className="md:mb-18 mb-6">
        <h2 className="text-4xl font-bold leading-[46px] md:text-5xl md:leading-[60px]">
          LabWeek22
        </h2>
        <p className="text-[16px] leading-6 text-slate-600 md:mx-auto md:mt-2 md:w-1/2 md:text-lg">
          The Protocol Labs Network is gathering in Lisbon for our first ever
          decentralized conference.
        </p>
      </div>
      <div className="md:gap-x-7.5 flex flex-col gap-6 md:mt-2 md:flex-row">
        <div className="h-[350px] grow">
          <EventCard
            cardUrl="https://plsummit.labweek.io/"
            imageURL="/assets/images/portal/pl-summit.png"
            topic="Conference"
            eventTitle="PL Summit"
            eventDetails="Lisbon, Oct. 24"
            handleClick={() =>
              trackGoal(FATHOM_EVENTS.portal.labWeek22.plSummit, 0)
            }
          />
        </div>

        <div className="h-[350px] grow">
          <EventCard
            cardUrl="https://2022.ipfs.camp/"
            imageURL="/assets/images/portal/ipfs-camp.png"
            topic="Talks & Workshops"
            eventTitle="IPFS Camp"
            eventDetails="Lisbon, Oct. 28"
            handleClick={() =>
              trackGoal(FATHOM_EVENTS.portal.labWeek22.ipfsCamp, 0)
            }
          />
        </div>

        <div className="h-[350px] grow">
          <EventCard
            cardUrl="https://fil-lisbon.io/"
            imageURL="/assets/images/portal/fil-lisbon.png"
            topic="Conference"
            eventTitle="FIL Lisbon"
            eventDetails="Lisbon, Oct. 31"
            handleClick={() =>
              trackGoal(FATHOM_EVENTS.portal.labWeek22.filLisbon, 0)
            }
          />
        </div>
      </div>

      <div className="mt-6 mr-3 flex md:mt-5 md:justify-end">
        <a
          href="https://22.labweek.io/#schedule"
          className="group mr-3 flex items-center text-sm font-semibold leading-5"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            trackGoal(FATHOM_EVENTS.portal.labWeek22.fullSchedule, 0)
          }
        >
          <span className="relative mr-1 after:absolute after:-bottom-px after:left-0 after:h-px after:w-full after:bg-gradient-to-r after:from-[#4282fc] after:to-[#44d5bb]">
            See full event schedule
          </span>

          <ArrowSmRightIcon className="h-4 w-4 stroke-2 transition-all ease-out group-hover:translate-x-1/4 group-hover:duration-[300ms]" />
        </a>
      </div>
    </section>
  );
};
