import { ReactElement } from 'react';
import { DirectoryEmpty } from '../../../components/directory/directory-empty/directory-empty';
import { useFakeInfiniteScroll } from '../../../hooks/directory/use-fake-infinite-scroll.hook';

interface DirectoryListProps {
  children: ReactElement[];
  itemsCount: number;
  filterProperties: string[];
}

export function DirectoryList({
  children,
  itemsCount,
  filterProperties,
}: DirectoryListProps) {
  const [visibleItems] = useFakeInfiniteScroll({
    items: children,
    lastVisibleItemElementSelector: '.directory-list-items > *:last-child',
  });

  return (
    <>
      <div className="directory-list-items flex flex-wrap gap-4">
        {visibleItems}
      </div>

      {!itemsCount ? (
        <div className="flex justify-center">
          <DirectoryEmpty
            filterProperties={[...filterProperties, 'searchBy']}
          />
        </div>
      ) : null}
    </>
  );
}
