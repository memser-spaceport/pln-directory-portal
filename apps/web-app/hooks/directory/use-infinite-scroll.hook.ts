import { IMember, ITeam } from '@protocol-labs-network/api';
import { useRouter } from 'next/router';
import { stringify } from 'querystring';
import { useCallback, useEffect, useState } from 'react';
import { ITEMS_PER_PAGE } from '../../constants';

type UseInfiniteScrollProps = {
  initialItems: ITeam[] | IMember[];
  baseAPIRoute: string;
  cardSelector: string;
  dataResultsProp: string;
};

export function useInfiniteScroll({
  initialItems,
  baseAPIRoute,
  cardSelector,
  dataResultsProp,
}: UseInfiniteScrollProps) {
  const [items, setItems] = useState<typeof initialItems>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [offset, setOffset] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();

  // Set first page of items based on initial items provided
  useEffect(() => {
    if (initialItems) {
      setItems(initialItems);
    }
  }, [initialItems]);

  useEffect(() => {
    // Make sure that we load additional items if the first 9 items don't
    // take more than the viewport height
    handleScroll();

    // Listen to the scroll position for loading additional data
    window.addEventListener('scroll', handleScroll);

    // Listen to route changes to reset state on non-shallow navigations
    router.events.on('routeChangeComplete', handleRouteChange);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  });

  // When navigation isn't shallow, reset component state to ensure that we
  // request data from the first page onwards
  const handleRouteChange = useCallback(
    (_pathname: string, { shallow }: { shallow: boolean }) => {
      if (!shallow) {
        setInitialLoad(true);
        setOffset('');
      }
    },
    [setInitialLoad, setOffset]
  );

  const handleScroll = useCallback(async () => {
    // Get last visible item
    const lastVisibleItem: HTMLDivElement =
      document.querySelector(cardSelector);

    if (lastVisibleItem) {
      // Get offset from the middle of the last visible item card
      const lastVisibleItemOffset =
        lastVisibleItem.offsetTop + lastVisibleItem.clientHeight / 2;
      const pageOffset = window.pageYOffset + window.innerHeight;

      // Detects when user scrolls down till the middle of the last card
      if (pageOffset > lastVisibleItemOffset) {
        // Prevent new requests:
        // - When there is no offset defined (unless it's the initial load)
        // - When there is only one page of results
        // - While already loading data;
        if (
          (initialLoad || offset) &&
          items.length >= ITEMS_PER_PAGE &&
          !loading
        ) {
          setLoading(true);

          // After the initial load, set the tracking state to false
          if (initialLoad) {
            setInitialLoad(false);
          }

          // Make a request to the API Route
          // with the currently selected query params and the available offset
          let url = baseAPIRoute;
          const queryString = stringify(router.query);

          if (offset) {
            url += `?offset=${offset}`;

            if (queryString) {
              url += `&${queryString}`;
            }
          } else if (queryString) {
            url += `?${queryString}`;
          }

          const response = await fetch(url);
          const data = await response.json();

          if (data.error) {
            setError(true);
          } else {
            if (data[dataResultsProp]) {
              // Update internal state with the response data
              setItems([...items, ...data[dataResultsProp]]);
              setOffset(data.offset);
            }
          }

          setLoading(false);
        }
      }
    }
  }, [
    initialLoad,
    loading,
    offset,
    items,
    router,
    baseAPIRoute,
    cardSelector,
    dataResultsProp,
  ]);

  return [items, loading, error] as const;
}
