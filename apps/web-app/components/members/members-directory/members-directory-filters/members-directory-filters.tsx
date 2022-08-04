import { DirectoryFilters } from '../../../../components/directory/directory-filters/directory-filters';
import { FriendOfPLNFilter } from '../../../../components/directory/directory-filters/friend-of-pln-filter/friend-of-pln-filter';
import { CountryFilter } from '../../../../components/members/members-directory/members-directory-filters/country-filter/country-filter';
import { MetroAreaFilter } from '../../../../components/members/members-directory/members-directory-filters/metro-area-filter/metro-area-filter';
import { OfficeHoursFilter } from '../../../../components/members/members-directory/members-directory-filters/office-hours-filter/office-hours-filter';
import { SkillsFilter } from '../../../../components/members/members-directory/members-directory-filters/skills-filter/skills-filter';
import { IMembersFiltersValues } from './members-directory-filters.types';

export interface MembersDirectoryFiltersProps {
  filtersValues: IMembersFiltersValues;
}

export function MembersDirectoryFilters({
  filtersValues,
}: MembersDirectoryFiltersProps) {
  return (
    <DirectoryFilters
      filterProperties={[
        'skills',
        'country',
        'metroArea',
        'officeHoursOnly',
        'includeFriends',
      ]}
    >
      <div className="space-y-4">
        <OfficeHoursFilter />
        <FriendOfPLNFilter />
      </div>
      <div className="my-5 h-px bg-slate-200" />
      <SkillsFilter skillsTags={filtersValues.skills} />
      <div className="my-5 h-px bg-slate-200" />
      <CountryFilter countryTags={filtersValues.country} />
      <div className="my-5 h-px bg-slate-200" />
      <MetroAreaFilter metroAreaTags={filtersValues.metroArea} />
    </DirectoryFilters>
  );
}
