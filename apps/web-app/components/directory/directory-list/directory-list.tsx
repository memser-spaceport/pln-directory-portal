import { ReactElement } from 'react';
import { DirectoryEmpty } from '../../../components/directory/directory-empty/directory-empty';

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
  return (
    <>
      <div className="flex flex-wrap gap-4">{children}</div>

      {!itemsCount ? (
        <div className="flex justify-center">
          <DirectoryEmpty filterProperties={filterProperties} />
        </div>
      ) : null}
    </>
  );
}
