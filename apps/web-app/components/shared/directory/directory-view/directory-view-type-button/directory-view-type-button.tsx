import { Tooltip } from '@protocol-labs-network/ui';
import { TDirectoryType } from '../../directory.types';
import { TViewType } from '../directory-view.types';

interface DirectoryViewTypeButtonProps {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  onClick: (clickedViewType: TViewType, directoryType: TDirectoryType) => void;
  selectedViewType: TViewType;
  viewType: TViewType;
  directoryType: TDirectoryType;
}

export function DirectoryViewTypeButton({
  icon,
  label,
  onClick,
  selectedViewType,
  viewType,
  directoryType,
}: DirectoryViewTypeButtonProps) {
  const ViewTypeIcon = icon;
  const isActive = viewType === selectedViewType;

  return (
    <div
      className={`directory-view-type group border transition duration-150 ease-in-out first:rounded-l-lg last:rounded-r-lg focus:outline-none active:outline-none
        ${
          isActive
            ? 'border-blue-100 bg-blue-100'
            : 'hover:shadow-on-hover border-white bg-white hover:z-10 active:z-10 active:border-blue-600 active:ring-2 active:ring-blue-300'
        }
        `}
    >
      <Tooltip
        trigger={
          <button
            className="on-focus flex h-10 w-10 items-center justify-center"
            onClick={() => onClick(viewType, directoryType)}
            disabled={isActive}
          >
            <span className="sr-only">{label}</span>
            <ViewTypeIcon
              className={`stroke-1.5 h-6 w-6 ${
                isActive
                  ? 'stroke-blue-700'
                  : 'stroke-slate-600 group-focus:stroke-slate-900'
              }`}
              aria-hidden="true"
            />
          </button>
        }
        asChild
        content={`${viewType === 'grid' ? 'Grid' : 'List'} View`}
      />
    </div>
  );
}
