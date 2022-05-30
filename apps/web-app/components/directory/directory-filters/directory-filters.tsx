import { useRouter } from 'next/router';

interface DirectoryFiltersProps {
  children: React.ReactNode;
  filterProperties: string[];
}

function DirectoryFilters({
  children,
  filterProperties,
}: DirectoryFiltersProps) {
  const { push, pathname, query } = useRouter();

  function clearFilters() {
    const cleanQuery = { ...query };

    filterProperties.forEach((property) => delete cleanQuery[property]);

    push({ pathname, query: cleanQuery });
  }

  return (
    <>
      <div className="flex justify-between p-5 border-b border-b-slate-200">
        <span className="text-lg font-semibold leading-7">Filters</span>
        <button
          className="text-xs text-sky-600 hover:text-sky-500 transition-colors"
          onClick={clearFilters}
        >
          Clear all
        </button>
      </div>
      <div className="p-5">{children}</div>
    </>
  );
}

export default DirectoryFilters;
