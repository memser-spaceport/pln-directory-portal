import Link from 'next/link';

export function InternalServerErrorMessage() {
  return (
    <div className="text-center text-sm text-slate-600">
      <h1 className="text-3xl font-bold">Error!</h1>
      <p className="mt-6 w-96 text-base">
        Something went wrong. Please try again later. {''}
      </p>
      <p className="mt-6 w-96 text-base">
        Back to {''}
        <Link href="/">
          <a className="text-base text-blue-600 outline-none hover:text-blue-700 focus:text-blue-900 active:text-blue-900">
            home
          </a>
        </Link>
        .
      </p>
    </div>
  );
}
