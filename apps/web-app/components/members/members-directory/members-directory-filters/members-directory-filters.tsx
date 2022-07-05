import { DirectoryFilters } from '../../../../components/directory/directory-filters/directory-filters';
import { CountryFilter } from '../../../../components/members/members-directory/members-directory-filters/country-filter/country-filter';
import { MetroAreaFilter } from '../../../../components/members/members-directory/members-directory-filters/metro-area-filter/metro-area-filter';
import { SkillsFilter } from '../../../../components/members/members-directory/members-directory-filters/skills-filter/skills-filter';
import { IMembersFiltersValues } from './members-directory-filters.types';

export interface MembersDirectoryFiltersProps {
  filtersValues: IMembersFiltersValues;
}

export function MembersDirectoryFilters({
  filtersValues,
}: MembersDirectoryFiltersProps) {
  return (
    <DirectoryFilters filterProperties={['skills', 'country', 'metroArea']}>
      <SkillsFilter skillsTags={filtersValues.skills} />
      <div className="my-5 h-px bg-slate-200" />
      <CountryFilter countryTags={filtersValues.country} />
      <div className="my-5 h-px bg-slate-200" />
      <MetroAreaFilter metroAreaTags={filtersValues.metroArea} />
    </DirectoryFilters>
  );
}
