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
      className={`group relative ml-[-1px] h-10 w-10 border first:ml-0 first:rounded-l-lg last:rounded-r-lg focus:z-20 focus:border-sky-300 focus:outline-none focus:ring focus:ring-sky-300/30
        ${
          isActive
            ? 'z-10 border-sky-600 bg-sky-100'
            : 'border-slate-300 bg-white'
        }
        `}
      onClick={() => onClick(viewType)}
      disabled={isActive}
    >
      <span className="sr-only">{label}</span>
      <ViewTypeIcon
        className={`m-auto h-6 w-6 ${
          isActive
            ? 'stroke-sky-600'
            : 'stroke-slate-600 group-hover:stroke-sky-600'
        }`}
        aria-hidden="true"
      />
    </button>
  );
}
