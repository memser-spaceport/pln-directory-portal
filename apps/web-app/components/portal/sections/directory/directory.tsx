import { trackGoal } from 'fathom-client';
import Image from 'next/image';
import { FATHOM_EVENTS } from '../../../../constants';
import { PortalButton } from '../../portal-button/portal-button';
import { PortalDivider } from '../../portal-divider/portal-divider';

const eventCode = FATHOM_EVENTS.portal.networkDirectory;

export const Directory = () => {
  return (
    <section className="gap-7.5 flex flex-col items-center md:flex-row">
      <div className="flex-1">
        <h2 className="text-4xl font-bold leading-[46px] md:text-5xl md:leading-[60px]">
          Explore our Network Directory
        </h2>
        <p className="mb-6 text-[16px] leading-6 text-slate-600 md:mb-8 md:mt-2 md:max-w-md md:text-lg">
          Navigate our growing ecosystem, find new partners, and get involved.
        </p>
        <PortalButton
          url="/directory"
          label="Network Directory"
          handleOnClick={() => eventCode && trackGoal(eventCode, 0)}
        />
      </div>
      <div className="flex-1">
        <div className="hidden md:block">
          <Image
            width="540"
            height="564"
            src="/assets/images/portal/directory-illustration.png"
            alt="Directory Illustration"
          />
        </div>
        <div className="mt-6 flex flex-col items-center gap-y-6 md:hidden">
          <div>
            <Image
              width="255"
              height="243"
              src="/assets/images/portal/filters.png"
              alt="Directory Filters Illustration"
            />
          </div>
          <div>
            <Image
              width="255"
              height="243"
              src="/assets/images/portal/teams.png"
              alt="Directory Teams Illustration"
            />
          </div>
          <div className="max-w-[255px]">
            <PortalDivider />
          </div>
          <div>
            <Image
              width="255"
              height="243"
              src="/assets/images/portal/members.png"
              alt="Directory Members Illustration"
            />
          </div>
          <div>
            <Image
              width="255"
              height="243"
              src="/assets/images/portal/office-hours.png"
              alt="Directory Office Hours Illustration"
            />
          </div>
        </div>
      </div>
    </section>
  );
};
