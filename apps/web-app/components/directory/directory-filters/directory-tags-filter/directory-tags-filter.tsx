import { ChevronDownIcon } from '@heroicons/react/solid';
import { Badge, Tag } from '@protocol-labs-network/ui';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useState } from 'react';
import { IFilterTag } from '../../../../components/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { DirectoryFilter } from '../directory-filter/directory-filter';

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
  const [open, setOpen] = useState(false);

  return (
    <DirectoryFilter title={title}>
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        {visibleTags.map((tag, index) => (
          <Tag key={index} {...tag} onClick={() => onTagToggle(index)} />
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
            <Collapsible.Trigger className="mt-2 flex items-center">
              <span className="mr-1 text-xs font-semibold leading-4">
                Show {open ? 'less' : 'more'}
              </span>
              {open ? null : <Badge text={`${collapsibleTags.length}`} />}
              <ChevronDownIcon
                className={`ml-2 h-5 ${open ? 'rotate-180' : ''}`}
              />
            </Collapsible.Trigger>
          </>
        ) : null}
      </Collapsible.Root>
    </DirectoryFilter>
  );
}
