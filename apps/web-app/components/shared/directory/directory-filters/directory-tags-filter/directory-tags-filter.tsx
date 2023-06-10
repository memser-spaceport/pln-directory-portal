import { ChevronDownIcon } from '@heroicons/react/solid';
import { Badge, Tag } from '@protocol-labs-network/ui';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useState } from 'react';
import { DirectoryFilter } from '../directory-filter/directory-filter';
import { IFilterTag } from './directory-tags-filter.types';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';


export interface DirectoryTagsFilterProps {
  title: string;
  tags: IFilterTag[];
  onTagToggle?: (index: number) => void;
}

const VISIBLE_TAGS_COUNT = 10;

export function DirectoryTagsFilter({
  title,
  tags,
  onTagToggle,
}: DirectoryTagsFilterProps) {
  const visibleTags = tags.slice(0, VISIBLE_TAGS_COUNT);
  const collapsibleTags = tags.slice(VISIBLE_TAGS_COUNT);
  const [open, setOpen] = useState(tags.some((tag) => tag.selected));
  const analytics = useAppAnalytics()
  const onTagClicked = (tagProps, index) => {
    if(tagProps.selected === false) {
      analytics.captureEvent(APP_ANALYTICS_EVENTS.FILTERS_APPLIED, {
        name: title,
        value: tagProps.value,
        nameAndValue: `${title}-${tagProps.value}`
      })
    }
    onTagToggle(index)
  }

  return (
    <DirectoryFilter title={title}>
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        {visibleTags.map((tag, index) => (
          <Tag key={index} {...tag} onClick={() => onTagClicked(tag, index)} />
        ))}
        {collapsibleTags.length ? (
          <>
            <Collapsible.Content className="inline">
              {collapsibleTags.map((tag, index) => (
                <Tag
                  key={index + VISIBLE_TAGS_COUNT}
                  {...tag}
                  onClick={() => onTagToggle(index + VISIBLE_TAGS_COUNT)}
                />
              ))}
            </Collapsible.Content>
            <Collapsible.Trigger className="group mt-2 flex items-center space-x-1 outline-none">
              <span className="leading-3.5 text-xs font-medium text-slate-900 group-focus-within:shadow-[0_1px_0_#156ff7] group-focus:shadow-[0_1px_0_#156ff7] group-focus-visible:shadow-[0_1px_0_#156ff7]">
                Show {open ? 'less' : 'more'}
              </span>
              <ChevronDownIcon className={`h-4 ${open ? 'rotate-180' : ''}`} />
              {open ? null : <Badge text={`${collapsibleTags.length}`} />}
            </Collapsible.Trigger>
          </>
        ) : null}
      </Collapsible.Root>
    </DirectoryFilter>
  );
}
