export interface BadgeProps {
  text: string;
}

export function Badge({ text }: BadgeProps) {
  return (
    <div className="text-xs font-medium leading-4 text-slate-600 py-0.5 px-2 bg-slate-100 rounded-3xl">
      {text}
    </div>
  );
}

export default Badge;
