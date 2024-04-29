import { PAGE_ROUTES } from 'apps/web-app/constants';
import { useRouter } from 'next/router';

interface DirectoryEmptyProps {
  filterProperties: string[];
  from?: string;
  callback: () => void;
  isUserLoggedIn?: boolean;
}

export function DirectoryEmpty({
  filterProperties,
  from,
  callback,
  isUserLoggedIn,
}: DirectoryEmptyProps) {
  const { push, pathname, query } = useRouter();

  function clearFilters() {
    const cleanQuery = { ...query };

    filterProperties.forEach((property) => delete cleanQuery[property]);
    if (pathname.includes('members')) {
      document.dispatchEvent(new CustomEvent('clearSearchText'));
    }

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
        clear all the criteria.
      </button>
      {from === PAGE_ROUTES.PROJECTS && (
        <div>
          If you&apos;re unable to find your project,&nbsp;
          {isUserLoggedIn ? (
            <button
              className="text-blue-600 outline-none hover:text-blue-700 focus:text-blue-900 active:text-blue-900"
              onClick={() => callback()}
            >
              click here
            </button>
          ) : (
            <span>please login</span>
          )}
          &nbsp;to add a project.
        </div>
      )}
    </div>
  );
}
