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
        className={`group relative ml-[-1px] h-10 w-10 border first:ml-0 first:rounded-l-lg last:rounded-r-lg focus:z-20 focus:border-sky-300 focus:outline-none focus:ring focus:ring-sky-300/30
        ${
          isActive
            ? 'z-10 border-sky-600 bg-sky-100'
            : 'border-slate-300 bg-white'
        }
        `}
        onClick={() => changeView(viewType)}
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
