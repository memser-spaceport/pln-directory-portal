import { useEffect, useRef, useState } from 'react';

export type CollapsibleTextProps = {
  classname?: string;
  maxHeight: number;
  txt: string;
};

export function CollapsibleText({
  classname,
  maxHeight,
  txt,
}: CollapsibleTextProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    if (!contentRef.current) {
      return;
    }

    setShowButton(contentRef.current.offsetHeight > maxHeight);
  }, [maxHeight]);

  return (
    <div className="space-y-2">
      <div
        className={`${classname} relative overflow-hidden whitespace-pre-wrap text-base ${
          isCollapsed && showButton
            ? 'before:absolute before:bottom-0 before:left-0 before:h-7 before:w-full before:bg-gradient-to-t before:from-white'
            : ''
        }`}
        style={{ maxHeight: isCollapsed ? `${maxHeight}px` : '' }}
      >
        <div ref={contentRef} dangerouslySetInnerHTML={{ __html: txt }} />
      </div>
      {showButton && (
        <button
          className="leading-3.5 w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-700"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {`Show ${isCollapsed ? 'more' : 'less'}`}
        </button>
      )}
    </div>
  );
}
