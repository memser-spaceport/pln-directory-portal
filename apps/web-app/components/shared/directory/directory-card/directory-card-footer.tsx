import { TagsGroup } from '../../tags-group/tags-group';

export interface DirectoryCardFooterProps {
  isGrid?: boolean;
  tagsArr: string[];
}
export function DirectoryCardFooter({
  isGrid,
  tagsArr,
}: DirectoryCardFooterProps) {
  return (
    <>
      {isGrid ? <div className="my-4 h-px bg-slate-200"></div> : null}
      <div className={isGrid ? 'min-h-[26px]' : 'w-[360px] self-center'}>
        {tagsArr?.length ? <TagsGroup isSingleLine items={tagsArr} /> : '-'}
      </div>
    </>
  );
}
