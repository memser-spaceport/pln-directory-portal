export interface TagsProps {
  tagsList: string[];
}

export function Tags({ tagsList }: TagsProps) {
  const renderTags = (arr: string[]) => {
    return arr.map((item: string, index: number) => (
      <div
        key={index}
        className="text-xs px-3 py-1 mr-2 mb-2 border rounded-full"
      >
        {item}
      </div>
    ));
  };

  return <div className="tagsContainer">{renderTags(tagsList)}</div>;
}

export default Tags;
