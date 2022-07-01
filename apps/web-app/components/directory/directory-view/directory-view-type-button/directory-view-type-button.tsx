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
    <button
      className={`group relative h-10 w-10 border first:rounded-l-lg last:rounded-r-lg focus:outline-none active:outline-none
        ${
          isActive
            ? 'border-blue-100 bg-blue-100'
            : 'border-white bg-white hover:z-10 hover:border-slate-200 hover:ring-2 hover:ring-blue-300 focus:z-10 focus:ring-2 focus:ring-blue-300 active:z-10 active:border-blue-600 active:ring-2 active:ring-blue-300'
        }
        `}
      onClick={() => onClick(viewType)}
      disabled={isActive}
    >
      <span className="sr-only">{label}</span>
      <ViewTypeIcon
        className={`m-auto h-6 w-6 ${
          isActive
            ? 'stroke-blue-700'
            : 'stroke-slate-600 group-focus:stroke-slate-900'
        }`}
        aria-hidden="true"
      />
    </button>
  );
}
