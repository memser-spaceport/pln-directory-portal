export interface CardProps {
  styleClassName?: string;
  children: React.ReactNode;
}

export function Card({ styleClassName, children }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-slate-300 p-8 shadow-[0_4px_4px_0px_rgba(15,23,42,.02)] ${styleClassName}`}
    >
      {children}
    </div>
  );
}
