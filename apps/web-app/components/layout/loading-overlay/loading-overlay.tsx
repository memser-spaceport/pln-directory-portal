import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { LoadingIndicator } from '../../../components/shared/loading-indicator/loading-indicator';

interface LoadingOverlayProps {
  excludeUrlFn?: (url: string) => boolean;
}

export function LoadingOverlay({ excludeUrlFn }: LoadingOverlayProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [overlayVisibility, setOverlayVisibility] = useState(false);

  useEffect(() => {
    const handleStart = async (
      url: string,
      { shallow }: { shallow: boolean }
    ) => {
      if (
        (!excludeUrlFn || (excludeUrlFn && !excludeUrlFn(url))) &&
        url !== router.asPath &&
        !shallow
      ) {
        setOverlayVisibility(true);
        await new Promise((resolve) => setTimeout(resolve, 0));
        setLoading(true);
      }
    };

    const handleComplete = async (
      url: string,
      { shallow }: { shallow: boolean }
    ) => {
      if (
        (!excludeUrlFn || (excludeUrlFn && !excludeUrlFn(url))) &&
        url === router.asPath &&
        !shallow
      ) {
        setLoading(false);
        await new Promise((resolve) => setTimeout(resolve, 300));
        setOverlayVisibility(false);
      }
    };

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleComplete);
    router.events.on('routeChangeError', handleComplete);

    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
      router.events.off('routeChangeError', handleComplete);
    };
  }, [excludeUrlFn, router]);

  return (
    overlayVisibility && (
      <div
        className={`fixed top-20 left-0 z-50 flex h-[calc(100vh_-_80px)] w-full items-center justify-center bg-slate-100 bg-opacity-50 transition-opacity duration-300 ${
          loading ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <LoadingIndicator />
      </div>
    )
  );
}
