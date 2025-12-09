import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';

const DEMO_DAY_HOSTS_QUERY_KEY = ['demo-day-hosts'];

function extractHosts(raw: any): string[] {
  let hosts: string[] = [];

  if (!raw) {
    return [];
  }

  if (Array.isArray(raw.hosts)) {
    hosts = raw.hosts.filter((h: any): h is string => typeof h === 'string');
  }

  else if (Array.isArray(raw)) {
    if (raw.length === 0) {
      hosts = [];
    } else if (typeof raw[0] === 'string') {
      hosts = raw as string[];
    } else {
      hosts = (raw as any[])
        .map((item) => {
          if (item && typeof item === 'object' && 'host' in item) {
            return (item as any).host;
          }
          return undefined;
        })
        .filter((h): h is string => typeof h === 'string' && h.length > 0);
    }
  }


  return Array.from(new Set(hosts)).sort();
}

export function useDemoDayHosts(authToken?: string) {
  return useQuery<string[]>({
    queryKey: DEMO_DAY_HOSTS_QUERY_KEY,
    enabled: !!authToken,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await api.get(API_ROUTE.ADMIN_DEMO_DAYS, {
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      return extractHosts(data);
    },
  });
}
