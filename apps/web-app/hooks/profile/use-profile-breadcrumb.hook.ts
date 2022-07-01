import { IBreadcrumbItem } from '@protocol-labs-network/ui';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

type UseProfileBreadcrumbProps = {
  backLink: string;
  directoryName: string;
  pageName: string;
};

export function useProfileBreadcrumb({
  backLink,
  directoryName,
  pageName,
}: UseProfileBreadcrumbProps) {
  const router = useRouter();
  const breadcrumbItems: IBreadcrumbItem[] = [
    {
      label: directoryName,
      href: backLink,
    },
    { label: pageName },
  ];

  useEffect(() => {
    if (router.query['backLink']) {
      const { backLink, ...query } = router.query;
      router.replace({ query }, undefined, { shallow: true });
    }
  }, [router]);

  return { breadcrumbItems };
}
