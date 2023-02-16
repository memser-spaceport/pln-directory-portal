import { LoadingIndicator } from '../../loading-indicator/loading-indicator';

export function DirectoryLoading() {
  return (
    <div className="animate-pulse">
      <LoadingIndicator />
    </div>
  );
}
