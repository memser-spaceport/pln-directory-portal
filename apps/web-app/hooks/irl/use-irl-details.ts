import { sortByDefault } from 'apps/web-app/utils/irl.utils';
import { useEffect, useState } from 'react';

export const useIrlDetails = (rawGuestList, userInfo) => {
  const rawGuest = [...rawGuestList];
  const [sortConfig, setSortConfig] = useState({ key: null, order: 'default' });
  const [filteredList, setFilteredList] = useState([...rawGuestList]);
  const [searchItem, setSearchItem] = useState('');

  useEffect(() => {
    const searchHandler = (e: any) => {
      setSearchItem(e.detail.searchValue);
    };

    const sortHandler = (e: any) => {
      const sortColumn = e.detail.sortColumn;
      setSortConfig((old) => {
        if (old.key === sortColumn) {
          if (old.order === 'asc') {
            return { key: old.key, order: 'desc' };
          } else if (old.order === 'desc') {
            return { key: old.key, order: 'default' };
          } else if (old.order === 'default') {
            return { key: old.key, order: 'asc' };
          }
        } else {
          return { key: sortColumn, order: 'asc' };
        }
      });
    };

    document.addEventListener('irl-details-searchlist', searchHandler);
    document.addEventListener('irl-details-sortlist', sortHandler);

    return () => {
      document.removeEventListener('irl-details-searchlist', searchHandler);
      document.removeEventListener('irl-details-sortlist', sortHandler);
    };
  }, []);

  useEffect(() => {
    let filteredItems = [...rawGuest];
    if (searchItem?.trim() !== '') {
      filteredItems = [...rawGuest].filter((v) =>
        v.memberName.toLowerCase().includes(searchItem.toLowerCase())
      );
      filteredItems = filteredItems.sort((a, b) =>
        a?.memberName.localeCompare(b?.memberName)
      );
    }

    if (sortConfig.key !== null) {
      if (sortConfig.order === 'asc' || sortConfig.order === 'desc') {
        const sortedData = [...filteredItems].sort((a, b) => {
          const valueA = a[sortConfig.key];
          const valueB = b[sortConfig.key];

          return sortConfig.order === 'asc'
            ? valueA?.localeCompare(valueB)
            : valueB?.localeCompare(valueA);
        });
        setFilteredList([...sortedData]);
      } else {

        const sortedGuests = sortByDefault(filteredItems);
        filteredItems = sortedGuests;

        const isUserGoing = filteredItems.some(
          (guest) => guest.memberUid === userInfo.uid
        );

        if (isUserGoing) {
          const currentUser = [...sortedGuests]?.find(
            (v) => v.memberUid === userInfo?.uid
          );
          if (currentUser) {
            const filteredList = [...sortedGuests]?.filter(
              (v) => v.memberUid !== userInfo?.uid
            );
            const formattedGuests = [currentUser, ...filteredList];
            filteredItems = formattedGuests;
          }
        }

        setFilteredList([...filteredItems]);
      }
    } else {
      setFilteredList([...filteredItems]);
    }
  }, [searchItem, sortConfig, rawGuestList]);

  return { filteredList, sortConfig };
};
