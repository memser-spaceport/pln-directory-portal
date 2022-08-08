import { Tooltip } from '@protocol-labs-network/ui';
import { TViewType } from '../directory-view.types';

interface DirectoryViewTypeButtonProps {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  onClick: (clickedViewType: TViewType) => void;
  selectedViewType: TViewType;
  viewType: TViewType;
}

export function DirectoryViewTypeButton({
  icon,
  label,
  onClick,
  selectedViewType,
  viewType,
}: DirectoryViewTypeButtonProps) {
  const ViewTypeIcon = icon;
  const isActive = viewType === selectedViewType;

  return (
    <div
      className={`group border transition duration-150 ease-in-out first:rounded-l-lg last:rounded-r-lg focus:outline-none active:outline-none
        ${
          isActive
            ? 'border-blue-100 bg-blue-100'
            : 'border-white bg-white hover:z-10 hover:border-slate-200 hover:ring-2 hover:ring-blue-300 focus:z-10 focus:ring-2 focus:ring-blue-300 active:z-10 active:border-blue-600 active:ring-2 active:ring-blue-300'
        }
        `}
    >
      <Tooltip
        trigger={
          <button
            className="flex h-10 w-10 items-center justify-center"
            onClick={() => onClick(viewType)}
            disabled={isActive}
          >
            <span className="sr-only">{label}</span>
            <ViewTypeIcon
              className={`h-6 w-6 ${
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
