import { Transition } from '@headlessui/react';
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
    const handleStart = async (
      url: string,
      { shallow }: { shallow: boolean }
    ) => {
      if (
        (!excludeUrlFn || (excludeUrlFn && !excludeUrlFn(url))) &&
        url !== router.asPath &&
        !shallow
      ) {
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
      }
    };

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleComplete);

    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
    };
  }, [excludeUrlFn, router]);

  return (
    <Transition
      show={loading}
      enter="transition-opacity duration-75"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-opacity duration-150"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
      className={`fixed top-20 left-0 z-50 flex h-[calc(100%_-_80px)] w-full items-center justify-center bg-slate-100/50`}
    >
      <LoadingIndicator />
    </Transition>
  );
}
