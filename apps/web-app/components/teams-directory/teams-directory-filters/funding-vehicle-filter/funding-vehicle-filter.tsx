import { IFilterTag } from '../../../../components/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from '../../../../components/directory/directory-filters/directory-tags-filter/use-tags-filter.hook';
import DirectoryTagsFilter from '../../../directory/directory-filters/directory-tags-filter/directory-tags-filter';

export interface FundingVehicleFilterProps {
  fundingVehicleTags: IFilterTag[];
}

function FundingVehicleFilter({
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

export default FundingVehicleFilter;
