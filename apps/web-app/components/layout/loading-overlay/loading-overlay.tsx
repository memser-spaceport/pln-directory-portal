import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { LoadingIndicator } from '../../../components/shared/loading-indicator/loading-indicator';

interface LoadingOverlayProps {
  excludeUrlFn?: (url: string) => boolean;
}

export function LoadingOverlay({ excludeUrlFn }: LoadingOverlayProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleStart = (url: string, { shallow }: { shallow: boolean }) => {
      if (
        (!excludeUrlFn || (excludeUrlFn && !excludeUrlFn(url))) &&
        url !== router.asPath &&
        !shallow
      ) {
        setLoading(true);
      }
    };

    const handleComplete = (url: string, { shallow }: { shallow: boolean }) => {
      if (
        (!excludeUrlFn || (excludeUrlFn && !excludeUrlFn(url))) &&
        url === router.asPath &&
        !shallow
      ) {
        setLoading(false);
      }
    };

    const handleError = (
      _err: Error,
      url: string,
      { shallow }: { shallow: boolean }
    ) => {
      handleComplete(url, { shallow });
    };

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleComplete);
    router.events.on('routeChangeError', handleError);

    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
      router.events.off('routeChangeError', handleError);
    };
  }, [excludeUrlFn, router]);

  return (
    <div
      className={`fixed left-0 z-50 flex h-[calc(100%_-_0px)] w-full items-center justify-center bg-slate-100/50 transition-[visibility,_opacity] duration-[0s,_300ms] ease-[linear,_linear] ${
        loading
          ? 'visible opacity-100 delay-[0s,0s]'
          : 'invisible opacity-0 delay-[300ms,0s]'
      }`}
    >
      <LoadingIndicator />
    </div>
  );
}
