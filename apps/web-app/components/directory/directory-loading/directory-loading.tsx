import { SpinnerIcon } from '@protocol-labs-network/ui';

export function DirectoryLoading() {
  return (
    <div className="flex animate-pulse items-center text-sm text-slate-600">
      <i className="mr-3 h-5 w-5 animate-spin text-blue-600">
        <SpinnerIcon />
      </i>
      <span>Loading...</span>
    </div>
  );
}
