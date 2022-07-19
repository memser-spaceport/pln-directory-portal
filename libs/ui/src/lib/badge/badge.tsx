export interface BadgeProps {
  text: string;
}

export function Badge({ text }: BadgeProps) {
  return (
    <div className="rounded-3xl bg-slate-100 py-0.5 px-2 text-xs font-medium leading-[1.17] text-slate-600">
      {text}
    </div>
  );
}
