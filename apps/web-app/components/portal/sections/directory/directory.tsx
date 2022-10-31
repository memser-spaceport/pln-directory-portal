import { trackGoal } from 'fathom-client';
import Image from 'next/image';
import { FATHOM_EVENTS } from '../../../../constants';
import { Card } from '../../card/card';
import { PortalButton } from '../../portal-button/portal-button';
import { PortalDivider } from '../../portal-divider/portal-divider';

const eventCode = FATHOM_EVENTS.portal.networkDirectory;

export const Directory = () => {
  return (
    <section className="md:gap-7.5 flex flex-col items-center gap-6 md:flex-row">
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
      <div className="flex flex-col gap-x-[15px] gap-y-6 md:flex-row">
        <div className="md:gap-y-7.5 flex flex-col gap-y-6 md:pt-12">
          <Card styleClassName="relative w-[255px] h-[243px] px-0">
            <h3 className="mx-8 mb-4 text-sm font-semibold">
              Explore with Filters
            </h3>
            <div className="flex h-full items-center justify-center bg-[url('/assets/images/portal/directory/filters-bg.svg')] bg-contain bg-bottom bg-no-repeat">
              <Image
                quality={100}
                width="207"
                height="103"
                src="/assets/images/portal/directory/filters.png"
                alt="Filters Illustration"
              />
            </div>
          </Card>
          <Card styleClassName="relative w-[255px] h-[243px] px-0">
            <h3 className="mx-8 mb-4 text-sm font-semibold">
              Search for Teams
            </h3>
            <div className="flex h-full items-center justify-center bg-[url('/assets/images/portal/directory/teams-bg.svg')] bg-contain bg-bottom bg-no-repeat">
              <Image
                quality={100}
                width="187"
                height="136"
                src="/assets/images/portal/directory/teams.png"
                alt="Teams Illustration"
              />
            </div>
          </Card>
        </div>
        <div>
          <div className="relative hidden h-full w-[1px] self-center opacity-80 md:block md:h-[350px]">
            <div className="bg-pln-gradient-03 absolute bottom-0 left-1/2 z-10 h-full w-[1px] -translate-x-1/2 blur-[2px]"></div>
            <div className="bg-pln-gradient-03 absolute bottom-0 left-1/2 z-20 h-full w-[1px] -translate-x-1/2"></div>
          </div>
          <div className="mx-auto w-[156px] md:hidden">
            <PortalDivider />
          </div>
        </div>
        <div className="md:gap-y-7.5 flex flex-col gap-y-6">
          <Card styleClassName="relative w-[255px] h-[243px] px-0">
            <h3 className="mx-8 mb-4 text-sm font-semibold">
              Collaborate with Members
            </h3>
            <div className="flex h-full items-center justify-center bg-[url('/assets/images/portal/directory/members-bg.svg')] bg-contain bg-bottom bg-no-repeat">
              <Image
                quality={100}
                width="174"
                height="152"
                src="/assets/images/portal/directory/members.png"
                alt="Members Illustration"
              />
            </div>
          </Card>
          <Card styleClassName="relative w-[255px] h-[243px] px-0">
            <h3 className="mx-8 mb-4 text-sm font-semibold">
              Meet using Office Hours
            </h3>
            <div className="flex h-full items-center justify-center bg-[url('/assets/images/portal/directory/office-hours-bg.svg')] bg-cover bg-no-repeat">
              <Image
                quality={100}
                width="173"
                height="135"
                src="/assets/images/portal/directory/office-hours.png"
                alt="Office Hours Illustration"
              />
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
};
