import { SearchIcon } from '@heroicons/react/solid';
import { InputField } from '@protocol-labs-network/ui';
import { useRouter } from 'next/router';

interface DirectorySearchProps {
  placeholder?: string;
}

export function DirectorySearch({
  placeholder = 'Search',
}: DirectorySearchProps) {
  const { query, push, pathname } = useRouter();
  const searchTerm = query.searchBy as string;

  function pushQuery(inputVal = '') {
    if (inputVal) {
      push({ pathname, query: { ...query, searchBy: inputVal } });
    } else if (searchTerm) {
      const { searchBy, ...restQuery } = query;
      push({ pathname, query: restQuery });
    }
  }

  return (
    <div className="w-[350px]">
      <InputField
        label="Search"
        name="searchBy"
        icon={SearchIcon}
        placeholder={placeholder}
        defaultValue={searchTerm}
        onKeyUp={(event) => {
          if (event.key === 'Enter' || event.keyCode === 13) {
            pushQuery(event.currentTarget.value);
          }
        }}
        hasClear
        onClear={() => pushQuery()}
      />
    </div>
  );
}
