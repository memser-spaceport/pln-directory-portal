import { ReactElement, useCallback, useEffect, useState } from 'react';

type UseFakeInfiniteScrollProps = {
  items: ReactElement[];
  lastVisibleItemElementSelector: string;
};

const ITEMS_PER_PAGE = 30;

export function useFakeInfiniteScroll({
  items,
  lastVisibleItemElementSelector,
}: UseFakeInfiniteScrollProps) {
  const [visibleItems, setVisibleItems] = useState<typeof items>([]);

  // Set first batch of items based on the items provided
  useEffect(() => {
    if (items) {
      setVisibleItems(items.slice(0, ITEMS_PER_PAGE));
    }
  }, [items]);

  useEffect(() => {
    // Make sure that we show additional items if the first batch of items
    // is not enough to fill the viewport
    handleScroll();

    // Listen to the scroll position for showing additional items
    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  });

  const handleScroll = useCallback(async () => {
    // Get last visible item
    const lastVisibleItem: HTMLDivElement = document.querySelector(
      lastVisibleItemElementSelector
    );

    if (lastVisibleItem) {
      // Get offset from the middle of the last visible item card
      const lastVisibleItemOffset =
        lastVisibleItem.offsetTop + lastVisibleItem.clientHeight / 2;
      const pageOffset = window.pageYOffset + window.innerHeight;

      // Check if user scrolled down till the middle of the last card
      // and if there are more items to show
      if (
        pageOffset > lastVisibleItemOffset &&
        items.length > visibleItems.length
      ) {
        // Show additional items
        setVisibleItems(items.slice(0, visibleItems.length + ITEMS_PER_PAGE));
      }
    }
  }, [lastVisibleItemElementSelector, items, visibleItems]);

  return [visibleItems] as const;
}
