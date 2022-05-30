import { IFilterTag } from '../../../../components/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import DirectoryFilter from '../directory-filter/directory-filter';

export interface DirectoryTagsFilterProps {
  title: string;
  tags: IFilterTag[];
  onTagToggle?: (index: number) => void;
}

function DirectoryTagsFilter({
  title,
  tags,
  onTagToggle,
}: DirectoryTagsFilterProps) {
  return (
    <DirectoryFilter title={title}>
      {tags.map((tag, index) => (
        <button
          key={index}
          className={`text-xs px-3 py-1 mr-2 mb-2 last:mr-0 border rounded-full hover:text-sky-700 focus:outline-none focus:ring focus:ring-sky-300/30 focus:border-sky-300 ${
            tag.selected
              ? 'border-sky-700 text-sky-700 bg-sky-100'
              : tag.disabled
              ? 'border-slate-200 text-slate-400 pointer-events-none'
              : 'border-slate-300'
          }`}
          onClick={() => onTagToggle(index)}
          disabled={tag.disabled}
        >
          {tag.value}
        </button>
      ))}
    </DirectoryFilter>
  );
}

export default DirectoryTagsFilter;
