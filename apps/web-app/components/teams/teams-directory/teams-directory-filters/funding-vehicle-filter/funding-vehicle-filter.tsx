import { DirectoryTagsFilter } from '../../../../directory/directory-filters/directory-tags-filter/directory-tags-filter';
import { IFilterTag } from '../../../../directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../directory/directory-filters/directory-tags-filter/use-tags-filter.hook';

export interface FundingVehicleFilterProps {
  fundingVehicleTags: IFilterTag[];
}

export function FundingVehicleFilter({
  fundingVehicleTags,
}: FundingVehicleFilterProps) {
  const [tags, toggleTag] = useTagsFilter('fundingVehicle', fundingVehicleTags);

  return (
    <DirectoryTagsFilter
      title="Funding Vehicle"
      tags={tags}
      onTagToggle={toggleTag}
    />
  );
}
