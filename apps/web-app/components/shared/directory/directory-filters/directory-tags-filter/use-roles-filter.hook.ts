import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import { URL_QUERY_VALUE_SEPARATOR } from '../../../../../constants';
import { IFilterTag } from './directory-tags-filter.types';
import { ROLE_FILTER_QUERY_NAME } from '../../../../../constants';

export function useRolesFilter(filterRoles: any[]) {
  const { query, push, pathname } = useRouter();
  const [roles, setRoles] = useState(filterRoles);

  useEffect(() => {
    setRoles(filterRoles);
  }, [setRoles, filterRoles]);

  const toggleRole = useCallback(
    (selectedRole: any) => {
      const { [ROLE_FILTER_QUERY_NAME]: queryFilterValue, ...restQuery } = query;
      let updatedRoles = roles;
      if(!selectedRole?.default && roles.indexOf(selectedRole)>0){
        const selectedIndex = roles.indexOf(selectedRole);
        updatedRoles.splice(selectedIndex,1);
      }
      else if(!selectedRole?.default && roles.indexOf(selectedRole)=== -1){
        updatedRoles = [...roles, {...selectedRole, selected: true}]
      }
      else{
        updatedRoles = roles.map((item) =>
        item.role === selectedRole.role ? { ...item, selected: !item.selected } : item
      );
      }
      const selectedRoles = updatedRoles
        .filter((role) => role.selected)
        .map((item) => item.role);

      push({
        pathname,
        query: {
          ...restQuery,
          ...(selectedRoles.length && {
            [ROLE_FILTER_QUERY_NAME]: selectedRoles.join(URL_QUERY_VALUE_SEPARATOR),
          }),
        },
      });
    },
    [query, push, pathname, roles, setRoles]
  );

  const unSelectAllRole = useCallback(
    () => {
      const { [ROLE_FILTER_QUERY_NAME]: queryFilterValue, ...restQuery } = query;
      const updatedRoles = roles.filter(role=>role.default)
      const newroles = updatedRoles
        ?.filter((role) => role.selected)
        .map((item) => item.role);

      push({
        pathname,
        query: {
          ...restQuery,
          ...(newroles.length && {
            [ROLE_FILTER_QUERY_NAME]: newroles.join(URL_QUERY_VALUE_SEPARATOR),
          }),
        },
      });
    },
    [query, push, pathname, roles, setRoles]
  );

  const selectAllRole = useCallback(
    (selectedRoles: any) => {
      const { [ROLE_FILTER_QUERY_NAME]: queryFilterValue, ...restQuery } = query;
      selectedRoles.map(role=>{
        role.selected=true;
        return role;
      })
      const updatedRoles = [...new Set([...roles, ...selectedRoles])];
      const newroles = updatedRoles
        ?.filter((role) => role.selected)
        .map((item) => item.role);

      push({
        pathname,
        query: {
          ...restQuery,
          ...(newroles.length && {
            [ROLE_FILTER_QUERY_NAME]: newroles.join(URL_QUERY_VALUE_SEPARATOR),
          }),
        },
      });
    },
    [query, push, pathname, roles, setRoles]
  );


  return [roles, toggleRole, selectAllRole, unSelectAllRole] as const;
}
