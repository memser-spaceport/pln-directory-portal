import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import { URL_QUERY_VALUE_SEPARATOR } from '../../../../../constants';
import { IFilterTag } from './directory-tags-filter.types';

export function useTagsFilter(filterName: string, filterTags: IFilterTag[]) {
  const { query, push, pathname } = useRouter();
  const [tags, setTags] = useState(filterTags);

  useEffect(() => {
    setTags(filterTags);
  }, [setTags, filterTags]);

  const toggleTag = useCallback(
    (index: number) => {
      const { [filterName]: queryFilterValue, ...restQuery } = query;
      const updatedTags = tags.map((tag, tagIndex) =>
        tagIndex === index ? { ...tag, selected: !tag.selected } : tag
      );
      const selectedTags = updatedTags
        .filter((tag) => tag.selected)
        .map((tag) => tag.value);

      setTags(updatedTags);

      push({
        pathname,
        query: {
          ...restQuery,
          ...(selectedTags.length && {
            [filterName]: selectedTags.join(URL_QUERY_VALUE_SEPARATOR),
          }),
        },
      });
    },
    [query, push, pathname, tags, setTags, filterName]
  );

  return [tags, toggleTag] as const;
}
