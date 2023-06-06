import { SpinnerIcon } from '@protocol-labs-network/ui';

export function LoadingIndicator() {
  return (
    <div className="flex items-center text-sm text-slate-600 bg-white w-56 h-20 rounded-md justify-center">
      <i className="mr-3 h-5 w-5 animate-spin text-blue-600">
        <SpinnerIcon />
      </i>
      <span>Loading...</span>
    </div>
  );
}
