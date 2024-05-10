import { useEffect, useState } from 'react';

export const useIrlDetails = (rawGuestList, userInfo) => {
  const rawGuest = [...rawGuestList];
  const [sortConfig, setSortConfig] = useState({ key: null, order: null });
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
          }
          return { key: old.key, order: 'asc' };
        } else {
          return { key: sortColumn, order: 'desc' };
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
      filteredItems = filteredItems.sort((a, b) => a?.memberName.localeCompare(b?.memberName))
    }

    if (sortConfig.key !== null) {
      // const isUserGoing = filteredItems.some(
      //   (guest) => guest.memberUid === userInfo.uid
      // );

      // if (isUserGoing) {
      //   const currentUser = [...filteredItems].find(
      //     (v) => v.memberUid === userInfo.uid
      //   );

      //   if (currentUser) {
      //     const filteredList = [...filteredItems].filter(
      //       (v) => v.memberUid !== userInfo.uid
      //     );
      //     //sort the remaining guests
      //     const formattedGuests = filteredList.sort((a, b) => {
      //       const valueA = a[sortConfig.key];
      //       const valueB = b[sortConfig.key];
      //       return sortConfig.order === 'asc'
      //         ? valueA.localeCompare(valueB)
      //         : valueB.localeCompare(valueA);
      //     });

      //     const sortedGuests = [currentUser, ...formattedGuests];

      //     setFilteredList([...sortedGuests]);
      //   }
      // } else {
        const sortedData = [...filteredItems].sort((a, b) => {
          const valueA = a[sortConfig.key];
          const valueB = b[sortConfig.key];

          return sortConfig.order === 'asc'
            ? valueA?.localeCompare(valueB)
            : valueB?.localeCompare(valueA);
        });
        setFilteredList([...sortedData]);
      // }
    } else {
      setFilteredList([...filteredItems]);
    }
  }, [searchItem, sortConfig,rawGuestList]);

  return { filteredList };
};
