import { CountryFilter } from '../../../../components/members/members-directory/members-directory-filters/country-filter/country-filter';
import { MetroAreaFilter } from '../../../../components/members/members-directory/members-directory-filters/metro-area-filter/metro-area-filter';
import { OfficeHoursFilter } from '../../../../components/members/members-directory/members-directory-filters/office-hours-filter/office-hours-filter';
import { OpenToWorkFilter } from '../../../../components/members/members-directory/members-directory-filters/open-to-work-filter/open-to-work-filter';
import { RegionFilter } from '../../../../components/members/members-directory/members-directory-filters/region-filter/region-filter';
import { SkillsFilter } from '../../../../components/members/members-directory/members-directory-filters/skills-filter/skills-filter';
import { DirectoryFilters } from '../../../shared/directory/directory-filters/directory-filters';
import { FriendOfPLNFilter } from '../../../shared/directory/directory-filters/friend-of-pln-filter/friend-of-pln-filter';
import { IMembersFiltersValues } from './members-directory-filters.types';

export interface MembersDirectoryFiltersProps {
  filtersValues: IMembersFiltersValues;
  filterProperties: string[];
  userInfo: any;
}

export function MembersDirectoryFilters({
  filtersValues,
  filterProperties,
  userInfo,
}: MembersDirectoryFiltersProps) {
  const isOpenToWorkEnabled =
    process.env.NEXT_PUBLIC_ENABLE_OPEN_TO_WORK === 'true' ? true : false;
  return (
    <DirectoryFilters filterProperties={filterProperties}>
      <div className="space-y-4">
        <OfficeHoursFilter />
        {isOpenToWorkEnabled && <OpenToWorkFilter />}
        <FriendOfPLNFilter />
      </div>
      <div className="my-5 h-px bg-slate-200" />
      <SkillsFilter skillsTags={filtersValues.skills} />
      <div className="my-5 h-px bg-slate-200" />
      <RegionFilter regionTags={filtersValues.region}/>
      <div className="my-5 h-px bg-slate-200" />
      <CountryFilter countryTags={filtersValues.country}/>
      <div className="my-5 h-px bg-slate-200" />
      <MetroAreaFilter metroAreaTags={filtersValues.metroArea}/>
    </DirectoryFilters>
  );
}
