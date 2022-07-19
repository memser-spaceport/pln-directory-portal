export interface TagProps {
  disabled: boolean;
  onClick?: () => void;
  selected: boolean;
  value: string;
}

export function Tag({ disabled, onClick, selected, value }: TagProps) {
  return (
    <button
      className={`mr-2 mb-2 rounded-full border border-slate-300 px-3 py-1.5 text-left text-xs font-medium leading-[1.17] last:mr-0 hover:border-slate-400 focus:border-[#156ff7] focus:shadow-[0_0_0_2px_rgba(21,111,247,0.25)] ${
        selected
          ? 'border-blue-700 bg-blue-100 text-blue-700'
          : disabled
          ? 'pointer-events-none border-slate-300 bg-slate-50 text-slate-500'
          : 'border-slate-300'
      }`}
      onClick={() => onClick && onClick()}
      disabled={disabled}
    >
      {value}
    </button>
  );
}
