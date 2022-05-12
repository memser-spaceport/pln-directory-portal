import { ViewGridIcon, ViewListIcon } from '@heroicons/react/outline';
import { useViewType } from './use-view-type.hook';
import { TViewType } from './view-types.types';

interface SelectViewTypeBtnProps {
  viewType: TViewType;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
}

export function SelectViewType() {
  const { selectedViewType, changeView } = useViewType();

  const viewTypeOptions: SelectViewTypeBtnProps[] = [
    { viewType: 'grid', icon: ViewGridIcon, label: 'Change to grid view' },
    { viewType: 'list', icon: ViewListIcon, label: 'Change to list view' },
  ];

  function SelectViewTypeBtn({
    viewType,
    icon,
    label,
  }: SelectViewTypeBtnProps) {
    const ViewTypeIcon = icon;
    const isActive = viewType === selectedViewType;

    return (
      <button
        className={`group w-10 h-10 border first:rounded-l-lg first:border-r-0 last:rounded-r-lg
        ${isActive ? 'bg-sky-50 border-sky-600' : 'bg-white border-slate-500'}
        `}
        onClick={() => changeView(viewType)}
        disabled={isActive}
      >
        <span className="sr-only">{label}</span>
        <ViewTypeIcon
          className={`h-6 w-6 m-auto ${
            isActive
              ? 'stroke-sky-600'
              : 'stroke-slate-500 group-hover:stroke-sky-600'
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
          <SelectViewTypeBtn
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
