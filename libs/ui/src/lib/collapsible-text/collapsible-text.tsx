import { useState } from 'react';

export type CollapsibleTextProps = {
  maxChars: number;
  txt: string;
};

const removeLineBreak = (txt: string) => txt.replace(/(\n|\r)/g, '');

export function CollapsibleText({ maxChars, txt }: CollapsibleTextProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const isLongerThanMaxChars = removeLineBreak(txt).length > maxChars;

  return (
    <div className="whitespace-pre-wrap text-base">
      {isCollapsed && isLongerThanMaxChars ? txt.substring(0, maxChars) : txt}{' '}
      {isLongerThanMaxChars ? (
        <button
          className="text-xs font-semibold leading-[14px] text-[#156FF7]"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {`Show ${isCollapsed ? 'more' : 'less'}`}
        </button>
      ) : null}
    </div>
  );
}
