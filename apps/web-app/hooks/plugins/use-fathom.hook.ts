import { load, trackPageview } from 'fathom-client';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export function useFathom() {
  const router = useRouter();

  useEffect(() => {
    function onRouteChangeComplete() {
      trackPageview();
    }

    if (
      process.env.NEXT_PUBLIC_FATHOM_TRACKING_CODE &&
      process.env.NEXT_PUBLIC_FATHOM_INCLUDED_DOMAINS
    ) {
      load(process.env.NEXT_PUBLIC_FATHOM_TRACKING_CODE, {
        includedDomains: [process.env.NEXT_PUBLIC_FATHOM_INCLUDED_DOMAINS],
      });

      // Record a pageview when route changes
      router.events.on('routeChangeComplete', onRouteChangeComplete);

      // Unassign event listeners
      return () => {
        router.events.off('routeChangeComplete', onRouteChangeComplete);
      };
    }
  }, [router.events]);
}
