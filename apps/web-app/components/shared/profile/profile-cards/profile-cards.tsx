import { ReactElement } from 'react';

interface ProfileCardsProps {
  title: string;
  count: number;
  children: ReactElement[];
}

export function ProfileCards({ title, count, children }: ProfileCardsProps) {
  return (
    <>
      <h3 className="mb-2 mt-6 font-medium text-slate-500">
        {title} ({count})
      </h3>
      <div className="max-h-96 overflow-y-auto rounded-xl shadow-[0px_0px_2px_rgba(15,23,42,0.16),0px_2px_2px_rgba(15,23,42,0.04)] focus-within:outline-none focus:outline-none focus-visible:outline-none">
        {children}
      </div>
    </>
  );
}