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
      <div className="relative flex items-center justify-between bg-white p-5 pl-[37px] before:absolute before:bottom-[-0.2rem] before:left-0 before:h-1 before:w-full before:border-t after:absolute after:bottom-0 after:left-0 after:h-7 after:w-[calc(100%_-_1.23rem)] after:translate-y-full after:bg-gradient-to-b after:from-white">
        <span className="text-lg font-semibold leading-7">Filters</span>
        <button
          className="on-focus--link leading-3.5 text-xs text-blue-600 transition-colors hover:text-blue-700"
          onClick={clearFilters}
        >
          Clear filters
        </button>
      </div>

      <div className="h-[calc(100vh_-_148px)] overflow-y-auto p-5 pl-[37px] focus-within:outline-none focus:outline-none focus-visible:outline-none">
        {children}
      </div>
    </>
  );
}
