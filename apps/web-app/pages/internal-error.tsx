import { InternalServerErrorMessage } from '../components/shared/error-message/internal-server-error';

export default function InternalError() {
  return (
    <div className="flex h-[calc(100vh_-_80px)] items-center justify-center">
      <InternalServerErrorMessage />
    </div>
  );
}
