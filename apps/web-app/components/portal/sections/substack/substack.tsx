import { ArrowSmRightIcon } from '@heroicons/react/solid';
import { trackGoal } from 'fathom-client';
import { FATHOM_EVENTS } from '../../../../constants';

export const Substack = () => {
  return (
    <section className="bg-pln-gradient-01 shadow-drop-shadow rounded-lg p-8 text-white">
      <div className="md:mx-auto md:max-w-[713px]">
        <h3 className="text-2xl font-semibold">Subscribe to our Substack!</h3>
        <p className="mt-2 mb-4 text-lg text-slate-100">
          Stay up to date with developments, new programs, and progress from
          other teams in the network.
        </p>
        <div className="flex">
          <a
            href="https://plnnews.substack.com/subscribe?utm_source=menu&simple=true&next=https%3A%2F%2Fplnnews.substack.com%2F"
            className="focus:shadow-pln-shadow-01--focus shadow-pln-shadow-01 rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-900 hover:border-slate-400 focus:border-blue-600"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackGoal(FATHOM_EVENTS.portal.substack.subscribe, 0)
            }
          >
            Subscribe
          </a>

          <a
            href="https://plnnews.substack.com/"
            className="group ml-4 flex items-center text-sm font-semibold leading-5"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackGoal(FATHOM_EVENTS.portal.substack.learnMore, 0)
            }
          >
            <span className="relative mr-1 after:absolute after:-bottom-px after:left-0 after:h-px after:w-full after:bg-white">
              Learn More
            </span>
            <ArrowSmRightIcon className="h-4 w-4 fill-white stroke-2 transition-all ease-out group-hover:translate-x-1/4 group-hover:duration-[300ms]" />
          </a>
        </div>
      </div>
    </section>
  );
};
