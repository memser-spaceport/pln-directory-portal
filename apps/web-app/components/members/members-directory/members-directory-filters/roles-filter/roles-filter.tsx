import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { useRolesFilter } from 'apps/web-app/components/shared/directory/directory-filters/directory-tags-filter/use-roles-filter.hook';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SearchIcon, XIcon } from '@heroicons/react/outline';
import { useDebounce } from 'apps/web-app/hooks/shared/use-debounce';
import { findRoleByName } from 'apps/web-app/services/member.service';
import { useRouter } from 'next/router';
import { getMembersOptionsFromQuery } from 'apps/web-app/utils/members.utils';

export interface RolesFilterProps {
  memberRoles: any;
}

export function RolesFilter({ memberRoles }: RolesFilterProps) {
  const searchTextRef = useRef<HTMLInputElement>(null);

  const [searchText, setSearchText] = useState<string>('');
  const [searchResults, setSearchResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const { query } = useRouter();

  const [roles, toggleRole, selectAllRole, unSelectAllRole] =
    useRolesFilter(memberRoles);
  const searchQuery = useDebounce(searchText, 300);
  const analytics = useAppAnalytics();

  const customSelected =
    roles.filter((item) => !item.default && item.selected).length > 0;
  const displayResults = searchResults?.filter(
    (newRole) => !roles.some((role) => role.role === newRole.role)
  );
  const isAllCustomRoleSelected =
    !searchResults.length &&
    roles.filter((item) => !item.default)?.length > 0 &&
    roles.filter((item) => !item.default).every((item) => item.selected);

  const handleRoleToggle = (role: any) => {
    if(!role?.selected){
      analytics.captureEvent(APP_ANALYTICS_EVENTS.FILTERS_APPLIED, {
        page: 'Members',
        name: 'Roles',
        value: role.label,
        nameAndValue: `Roles-${role.label}`,
      });
    }
    toggleRole(role);
  };

  const handleInputChange = useCallback((event) => {
    setIsProcessing(true);
    setSearchText(event.target.value);
  }, []);

  const handleSearchTextClear = () => {
    setSearchText('');
    searchTextRef.current.value = '';
    setSearchResults([]);
  };

  const handleSelectAllRole = () => {
    if (!isAllCustomRoleSelected) {
      selectAllRole(displayResults);
      analytics.captureEvent(
        APP_ANALYTICS_EVENTS.MEMBER_ROLE_FILTER_SELECT_ALL,
        {
          page: 'Members',
          filterName: 'Roles',
          searchText: searchQuery,
        }
      );
    } else {
      unSelectAllRole();
    }
  };

  const handleFindRolesByName = (searchQuery: string) => {
    const optionsFromQuery = getMembersOptionsFromQuery(query);
    findRoleByName({ params: { ...optionsFromQuery, searchText: searchQuery } })
      .then((newRoles) => {
        const selectedRoles = newRoles.filter(
          (newRole) => !roles.some((role) => role.role === newRole.role)
        );
        setSearchResults([...selectedRoles]);
      })
      .catch((e) => {
        console.log(e);
        analytics.captureEvent(
          APP_ANALYTICS_EVENTS.MEMBER_ROLE_FILTER_SEARCH_ERROR,
          {
            page: 'Members',
            filterName: 'Roles',
            searchText: searchQuery,
            reason: e,
          }
        );
      })
      .finally(() => setIsProcessing(false));
  };

  const getSelectAllCount = () => {
    const customRoles = [
      ...roles.filter((item) => !item.default),
      ...displayResults,
    ];
    let allRoleCount = 0;
    customRoles.forEach((item) => {
      allRoleCount = allRoleCount + item.count;
    });
    return allRoleCount;
  };

  useEffect(() => {
    if (searchQuery !== '') {
      handleFindRolesByName(searchQuery);
      analytics.captureEvent(
        APP_ANALYTICS_EVENTS.MEMBER_ROLE_FILTER_SEARCH_CALLED,
        {
          page: 'Members',
          filterName: 'Roles',
          searchText: searchQuery,
        }
      );
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (searchQuery !== '') {
      handleFindRolesByName(searchQuery);
    } else {
      setSearchResults([]);
    }
  }, [roles]);

  useEffect(() => {
    const handler = (e: any) => {
      setSearchText("");
      if(searchTextRef?.current){
        searchTextRef.current.value = "";
      }
    };
    document.addEventListener('clearSearchText', handler);
    return () => {
      document.removeEventListener('clearSearchText', handler);
    };
  }, []);

  return (
    <div className="flex w-[100%] flex-col">
      <p className="mb-3 text-sm font-semibold leading-5">Roles</p>
      <div className="relative mb-4 block w-full">
        <SearchIcon className="stroke-1.5 absolute inset-y-0 left-3 my-auto h-4 w-4 text-[#64748B]" />
        <input
          type="text"
          name="roles"
          className={`h-[40px] w-full rounded-[8px] border border-gray-200 py-[8px] pl-[36px] ${
            searchTextRef?.current?.value ? 'pr-[30px]' : 'pr-[8px]'
          }  text-[14px] leading-[24px] outline-none`}
          ref={searchTextRef}
          placeholder="Search Role [eg. Engineer]"
          onChange={handleInputChange}
        />
        {searchTextRef?.current?.value && (
          <button onClick={handleSearchTextClear}>
            <XIcon className="absolute inset-y-0 right-3 my-auto h-4 w-4 stroke-1 text-[#64748B]" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex max-h-[180px] flex-col gap-2 overflow-y-auto">
          {displayResults.length === 0 &&
            searchTextRef?.current?.value &&
            !isProcessing && !customSelected && (
              <p className="flex w-full items-center justify-center rounded-[4px] bg-[#F1F5F9] py-[6px] text-[#0F172A]">
                <span className="text-[12px] font-[500] leading-[14px]">
                  No roles found
                </span>
              </p>
            )}
          {(displayResults.length > 0 || customSelected) && (
            <label className="checkbox flex items-center">
              <input
                type="checkbox"
                className="h-[20px] w-[20px]"
                checked={isAllCustomRoleSelected}
                onChange={() => handleSelectAllRole()}
              />
              <span className="ml-2 w-[180px] text-[12px] font-[500] leading-[14px] text-[#0F172A]">
                <span className="mr-[6px]">Select All</span>{' '}
                <span className="rounded-[2px] bg-[#F1F5F9] px-[5px] text-[10px] font-[500] leading-[14px]">
                  {getSelectAllCount()}
                </span>
              </span>
            </label>
          )}
          {roles
            .filter((item) => !item.default && item.selected)
            ?.map((item) => (
              <label key={item.role} className="checkbox flex items-center">
                <input
                  type="checkbox"
                  className="h-[20px] w-[20px]"
                  checked={item.selected}
                  onChange={() => handleRoleToggle(item)}
                />
                <span className="ml-2 w-[180px] text-[12px] font-[500] leading-[14px] text-[#0F172A]">
                  <span className="mr-[6px]">{item.alias ?? item.role}</span>{' '}
                  <span className="rounded-[2px] bg-[#F1F5F9] px-[5px] text-[10px] font-[500] leading-[14px]">
                    {item.count}
                  </span>
                </span>
              </label>
            ))}
          {searchTextRef?.current?.value && (
            <div className="flex flex-col gap-2">
              {displayResults?.map((item) => (
                <label key={item.role} className="checkbox flex items-center">
                  <input
                    type="checkbox"
                    className="h-[20px] w-[20px]"
                    checked={item.selected}
                    onChange={() => handleRoleToggle(item)}
                  />
                  <span className="ml-2 w-[180px] text-[12px] font-[500] leading-[14px] text-[#0F172A]">
                    <span className="mr-[6px]">{item.alias ?? item.role}</span>{' '}
                    <span className="rounded-[2px] bg-[#F1F5F9] px-[5px] text-[10px] font-[500] leading-[14px]">
                      {item.count}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        {(searchTextRef?.current?.value || customSelected) && (
          <div className="my-2 h-px bg-slate-200" />
        )}
        {roles
          .filter((item) => item?.default)
          ?.map((item) => (
            <label key={item.role} className="checkbox flex items-center">
              <input
                type="checkbox"
                className="h-[20px] w-[20px]"
                checked={item.selected}
                onChange={() => handleRoleToggle(item)}
              />
              <span className="ml-2 w-[180px] text-[12px] font-[500] leading-[14px] text-[#0F172A]">
                <span className="mr-[6px]">{item.alias ?? item.role}</span>{' '}
                <span className="rounded-[2px] bg-[#F1F5F9] px-[5px] text-[10px] font-[500] leading-[14px]">
                  {item.count}
                </span>
              </span>
            </label>
          ))}
      </div>
    </div>
  );
}
