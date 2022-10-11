export interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export function Card({ className, children }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-slate-300 p-8 shadow-slate-900/5 ${className}`}
    >
      {children}
    </div>
  );
}
