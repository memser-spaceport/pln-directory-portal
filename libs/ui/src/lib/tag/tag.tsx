export interface TagProps {
  disabled: boolean;
  onClick?: () => void;
  selected: boolean;
  value: string;
}

export function Tag({ disabled, onClick, selected, value }: TagProps) {
  return (
    <button
      className={`mr-2 mb-2 rounded-full border px-3 py-1 text-xs last:mr-0 hover:text-sky-700 focus:border-sky-300 focus:outline-none focus:ring focus:ring-sky-300/30 ${
        selected
          ? 'border-sky-700 bg-sky-100 text-sky-700'
          : disabled
          ? 'pointer-events-none border-slate-200 text-slate-400'
          : 'border-slate-300'
      }`}
      onClick={() => onClick && onClick()}
      disabled={disabled}
    >
      {value}
    </button>
  );
}
