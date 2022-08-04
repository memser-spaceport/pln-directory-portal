import { DirectorySearch } from '../../../components/directory/directory-search/directory-search';
import { DirectorySort } from '../../../components/directory/directory-sort/directory-sort';
import { DirectoryView } from '../../../components/directory/directory-view/directory-view';

type DirectoryHeaderProps = {
  searchPlaceholder: string;
  title: string;
  count: number;
};

export function DirectoryHeader({
  searchPlaceholder,
  title,
  count,
}: DirectoryHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-3xl font-bold">
        {title}{' '}
        <span className="text-sm font-normal text-slate-600">({count})</span>
      </h1>
      <div className="flex items-center space-x-4">
        <DirectorySearch placeholder={searchPlaceholder} />
        <span className="h-6 w-px bg-slate-300" />
        <DirectorySort />
        <DirectoryView />
      </div>
    </div>
  );
}
