import { ViewGridIcon, ViewListIcon } from '@heroicons/react/outline';
import { useViewType } from './use-view-type.hook';
import { TViewType } from './view-types.types';

interface DirectoryViewTypeBtnProps {
  viewType: TViewType;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
}

export function DirectoryViewType() {
  const { selectedViewType, changeView } = useViewType();

  const viewTypeOptions: DirectoryViewTypeBtnProps[] = [
    { viewType: 'grid', icon: ViewGridIcon, label: 'Change to grid view' },
    { viewType: 'list', icon: ViewListIcon, label: 'Change to list view' },
  ];

  function DirectoryViewTypeBtn({
    viewType,
    icon,
    label,
  }: DirectoryViewTypeBtnProps) {
    const ViewTypeIcon = icon;
    const isActive = viewType === selectedViewType;

    return (
      <button
        className={`group relative w-10 h-10 border first:rounded-l-lg last:rounded-r-lg ml-[-1px] first:ml-0 focus:outline-none focus:ring focus:ring-sky-300/30 focus:border-sky-300 focus:z-20
        ${
          isActive
            ? 'bg-sky-100 border-sky-600 z-10'
            : 'bg-white border-slate-300'
        }
        `}
        onClick={() => changeView(viewType)}
        disabled={isActive}
      >
        <span className="sr-only">{label}</span>
        <ViewTypeIcon
          className={`h-6 w-6 m-auto ${
            isActive
              ? 'stroke-sky-600'
              : 'stroke-slate-600 group-hover:stroke-sky-600'
          }`}
          aria-hidden="true"
        />
      </button>
    );
  }

  return (
    <div className="flex">
      {viewTypeOptions.map((option) => {
        return (
          <DirectoryViewTypeBtn
            key={option.viewType}
            viewType={option.viewType}
            icon={option.icon}
            label={option.label}
          />
        );
      })}
    </div>
  );
}
