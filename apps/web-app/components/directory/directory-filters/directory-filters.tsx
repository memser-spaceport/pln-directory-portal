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
      <div className="relative flex justify-between bg-white p-5 before:absolute before:left-0 before:bottom-[-0.2rem] before:h-1 before:w-full before:border-t after:absolute after:bottom-[-2.25rem] after:left-0 after:h-9 after:w-[calc(100%_-_1.23rem)] after:bg-gradient-to-b after:from-white">
        <span className="text-lg font-semibold leading-7">Filters</span>
        <button
          className="text-xs text-sky-600 transition-colors hover:text-sky-500"
          onClick={clearFilters}
        >
          Clear all
        </button>
      </div>

      <div className="h-[calc(100vh_-_148px)] overflow-y-auto p-5">
        {children}
      </div>
    </>
  );
}
