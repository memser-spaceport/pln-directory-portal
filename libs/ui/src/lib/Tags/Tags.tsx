import { useEffect, useRef } from 'react';

export interface TagsProps {
  tagsList: string[];
}

export const renderTags = (arr: string[]) => {
  return arr.map((item: string, i: number) => (
    <div key={i} className="text-xs px-3 py-1 mr-2 mb-2 border rounded-full">
      {item}
    </div>
  ));
};

export function Tags({ tagsList }: TagsProps) {
  const containerRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const rightLimit = containerRef.current
      ? containerRef.current?.offsetLeft + containerRef.current?.offsetWidth
      : null;
    const childrenArr = containerRef.current
      ? [].slice.call(containerRef.current.children)
      : [];

    childrenArr.map((el) => {
      const isOnLimitX = el.offsetLeft + el.offsetWidth >= rightLimit;
      if (isOnLimitX) {
        el.style.display = 'none';
      }
    });
  }, []);

  return (
    <div className="flex" ref={containerRef}>
      {renderTags(tagsList)}
    </div>
  );
}

export default Tags;
