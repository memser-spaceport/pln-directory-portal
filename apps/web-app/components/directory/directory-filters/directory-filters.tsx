import { useRouter } from 'next/router';

interface DirectoryFiltersProps {
  children: React.ReactNode;
  filterProperties: string[];
}

export function DirectoryFilters({
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
      <div className="flex justify-between border-b border-b-slate-200 p-5">
        <span className="text-lg font-semibold leading-7">Filters</span>
        <button
          className="text-xs text-sky-600 transition-colors hover:text-sky-500"
          onClick={clearFilters}
        >
          Clear all
        </button>
      </div>
      <div className="p-5">{children}</div>
    </>
  );
}
