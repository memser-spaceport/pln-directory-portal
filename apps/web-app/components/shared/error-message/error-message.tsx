import Link from 'next/link';

export function ErrorMessage() {
  return (
    <div className="text-center text-sm text-slate-600">
      <h1 className="text-3xl font-bold">Error 404</h1>
      <p className="mt-6 w-96 text-base">
        We couldn’t find the page you were looking for. <br />
        Try search what you’re looking for on the {''}
        <Link href="/teams">
          <a className="text-base text-blue-600 outline-none hover:text-blue-700 focus:text-blue-900 active:text-blue-900">
            teams page
          </a>
        </Link>
        .
      </p>
    </div>
  );
}
