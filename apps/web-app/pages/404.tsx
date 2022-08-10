import { ErrorMessage } from '../components/shared/error-message/error-message';

export default function Custom404() {
  return (
    <div className="flex h-[calc(100vh_-_80px)] items-center justify-center">
      <ErrorMessage />
    </div>
  );
}
