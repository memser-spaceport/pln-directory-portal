export interface BadgeProps {
  text: string;
}

export function Badge({ text }: BadgeProps) {
  return (
    <div className="leading-3.5 rounded-3xl bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      {text}
    </div>
  );
}
