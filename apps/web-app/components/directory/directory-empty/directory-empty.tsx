import { useRouter } from 'next/router';

interface DirectoryEmptyProps {
  filterProperties: string[];
}

export function DirectoryEmpty({ filterProperties }: DirectoryEmptyProps) {
  const { push, pathname, query } = useRouter();

  function clearFilters() {
    const cleanQuery = { ...query };

    filterProperties.forEach((property) => delete cleanQuery[property]);

    push({ pathname, query: cleanQuery });
  }

  return (
    <div className="text-center text-sm text-slate-600">
      There are no results for your criteria.
      <br />
      You can try to define different criteria or to{' '}
      <button
        className="text-blue-600 outline-none hover:text-blue-700 focus:text-blue-900 active:text-blue-900"
        onClick={() => clearFilters()}
      >
        clear the filters
      </button>
      .
    </div>
  );
}
