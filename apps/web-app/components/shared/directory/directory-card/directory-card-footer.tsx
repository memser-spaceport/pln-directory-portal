import { TagsGroup } from '../../tags-group/tags-group';

export interface DirectoryCardFooterProps {
  isGrid?: boolean;
  tagsArr: string[];
  type: string;
}
export function DirectoryCardFooter({
  isGrid,
  tagsArr,
  type
}: DirectoryCardFooterProps) {
  return (
    <>
      {isGrid ? <div className={`my-4 ${type === 'member' ? 'mx-5':''} h-px bg-slate-200`}></div> : null}
      <div className={isGrid ? `min-h-[26px] ${type === 'member' ? 'px-5 pb-4': ' '}`: `w-[360px] self-center`}>
        {tagsArr?.length ? <TagsGroup isSingleLine items={tagsArr} /> : '-'}
      </div>
    </>
  );
}
