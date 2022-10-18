export interface CardProps {
  styleClassName?: string;
  children: React.ReactNode;
}

export function Card({ styleClassName, children }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-slate-300 p-8 shadow-slate-900/5 ${styleClassName}`}
    >
      {children}
    </div>
  );
}
