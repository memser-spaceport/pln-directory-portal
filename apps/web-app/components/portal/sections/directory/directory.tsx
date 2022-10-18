import Image from 'next/image';
import { PortalButton } from '../../portal-button/portal-button';
import { PortalDivider } from '../../portal-divider/portal-divider';

export const Directory = () => {
  return (
    <section className="gap-7.5 flex flex-col items-center sm:flex-row">
      <div className="flex-1">
        <h2 className="text-4xl font-bold leading-[46px] sm:text-5xl sm:leading-[60px]">
          Explore our Network Directory
        </h2>
        <p className="mb-6 text-[16px] leading-6 text-slate-600 sm:mb-8 sm:mt-2 sm:max-w-md sm:text-lg">
          Navigate our growing ecosystem, find new partners, and get involved.
        </p>
        <PortalButton url="/directory" label="Network Directory" />
      </div>
      <div className="flex-1">
        <div className="hidden sm:block">
          <Image
            width="540"
            height="564"
            src="/assets/images/portal/directory-illustration.png"
            alt="Directory Illustration"
          />
        </div>
        <div className="mt-6 flex flex-col items-center gap-y-6 sm:hidden">
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
