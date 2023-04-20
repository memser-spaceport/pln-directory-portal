export default function InternalServerError() {
  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex items-center justify-center text-center text-sm text-slate-600">
        <p className="mt-6 text-base">
          <h1 className="text-3xl font-bold">Error 500</h1>
          Oops something went wrong! <br />
          <br />
          <br />
          Try to refresh the page or feel free to contact us if the problem
          persists.
        </p>
      </div>
    </div>
  );
}
