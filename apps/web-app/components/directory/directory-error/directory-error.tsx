import { ExclamationCircleIcon } from '@heroicons/react/solid';
import { useRouter } from 'next/router';

export function DirectoryError() {
  const router = useRouter();

  return (
    <div className="flex items-center text-sm text-slate-600">
      <i className="mr-1 h-5 w-5 text-red-600">
        <ExclamationCircleIcon />
      </i>
      <span>
        Ups, something went wrong on our side. Please, try{' '}
        <button
          className="text-blue-600 outline-none hover:text-blue-700 focus:text-blue-900 active:text-blue-900"
          onClick={() => router.reload()}
        >
          refreshing
        </button>{' '}
        the page.
      </span>
    </div>
  );
}
