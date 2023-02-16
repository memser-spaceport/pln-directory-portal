import { TDirectoryType } from '../directory.types';
import { DirectoryViewTypeButton } from './directory-view-type-button/directory-view-type-button';
import { DIRECTORY_VIEW_TYPE_OPTIONS } from './directory-view.constants';
import { useViewType } from './use-directory-view-type.hook';

type DirectoryViewProps = {
  directoryType: TDirectoryType;
};

export function DirectoryView({ directoryType }: DirectoryViewProps) {
  const { selectedViewType, changeView } = useViewType();

  return (
    <div className="flex rounded-lg shadow-sm shadow-slate-300">
      {DIRECTORY_VIEW_TYPE_OPTIONS.map((option) => {
        return (
          <DirectoryViewTypeButton
            icon={option.icon}
            key={option.viewType}
            label={option.label}
            onClick={changeView}
            selectedViewType={selectedViewType}
            viewType={option.viewType}
            directoryType={directoryType}
          />
        );
      })}
    </div>
  );
}
