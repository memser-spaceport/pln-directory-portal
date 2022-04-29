import { ViewGridIcon, ViewListIcon } from '@heroicons/react/outline';

export type ToggleViewProps = {
  isGrid: boolean;
} & Pick<React.ComponentPropsWithoutRef<'button'>, 'onClick'>;

export function ToggleView({ isGrid, onClick }: ToggleViewProps) {
  return (
    <div className="flex" role="group" aria-label="Change View">
      <button
        id="grid-btn"
        className={`group w-10 h-10 rounded-l-lg border border-r-0 ${
          isGrid
            ? 'bg-indigo-50  border-indigo-600'
            : 'bg-white border-slate-500'
        }`}
        onClick={onClick}
      >
        <ViewGridIcon
          className={`h-6 w-6 m-auto ${
            isGrid
              ? 'stroke-indigo-600'
              : 'stroke-slate-500 group-hover:stroke-indigo-600'
          }`}
        />
      </button>
      <button
        id="list-btn"
        className={`group w-10 h-10 rounded-r-lg border ${
          !isGrid
            ? 'bg-indigo-50  border-indigo-600'
            : 'bg-white border-slate-500'
        }`}
        onClick={onClick}
      >
        <ViewListIcon
          className={`h-6 w-6 m-auto ${
            !isGrid
              ? 'stroke-indigo-600'
              : 'stroke-slate-500 group-hover:stroke-indigo-600'
          }`}
        />
      </button>
    </div>
  );
}
