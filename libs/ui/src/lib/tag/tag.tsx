export interface TagProps {
  disabled: boolean;
  onClick?: () => void;
  selected: boolean;
  value: string;
}

export function Tag({ disabled, onClick, selected, value }: TagProps) {
  return (
    <button
      className={`text-xs px-3 py-1 mr-2 mb-2 last:mr-0 border rounded-full hover:text-sky-700 focus:outline-none focus:ring focus:ring-sky-300/30 focus:border-sky-300 ${
        selected
          ? 'border-sky-700 text-sky-700 bg-sky-100'
          : disabled
          ? 'border-slate-200 text-slate-400 pointer-events-none'
          : 'border-slate-300'
      }`}
      onClick={() => onClick && onClick()}
      disabled={disabled}
    >
      {value}
    </button>
  );
}

export default Tag;
