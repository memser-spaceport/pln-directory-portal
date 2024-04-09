import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { DirectorySearch } from '../directory-search/directory-search';
import { DirectorySort } from '../directory-sort/directory-sort';
import { DirectoryView } from '../directory-view/directory-view';
import { TDirectoryType } from '../directory.types';

type DirectoryHeaderProps = {
  searchPlaceholder: string;
  title: string;
  directoryType: TDirectoryType;
  count: number;
};

export function DirectoryHeader({
  searchPlaceholder,
  title,
  directoryType,
  count,
}: DirectoryHeaderProps) {
  const analytics = useAppAnalytics()
  const onSearch = (searchKey) => {
    analytics.captureEvent(`${title.toLowerCase()}-search`, {
      name: searchKey
    })
  }
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-3xl font-bold">
        {title}{' '}
        <span className="text-sm font-normal text-slate-600">({count})</span>
      </h1>
      <div className="flex items-center space-x-4">
        <DirectorySearch onSearch={onSearch} placeholder={searchPlaceholder} />
        <span className="h-6 w-px bg-slate-300" />
        <DirectorySort directoryType= {directoryType}/>
        <DirectoryView directoryType={directoryType} />
      </div>
    </div>
  );
}
