export interface TagProps {
  disabled: boolean;
  onClick?: () => void;
  selected: boolean;
  value: string;
}

export function Tag({ disabled, onClick, selected, value }: TagProps) {
  return (
    <button
      className={`!on-focus leading-3.5 mb-2 mr-2 rounded-full border border-slate-300 px-3 py-1.5 text-left text-xs font-medium last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full ${
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
