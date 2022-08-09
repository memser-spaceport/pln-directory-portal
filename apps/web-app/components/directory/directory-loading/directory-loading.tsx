import { LoadingIndicator } from '../../../components/shared/loading-indicator/loading-indicator';

export function DirectoryLoading() {
  return (
    <div className="animate-pulse">
      <LoadingIndicator />
    </div>
  );
}
