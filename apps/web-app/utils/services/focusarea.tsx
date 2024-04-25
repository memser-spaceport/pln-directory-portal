import { FILTER_API_ROUTES } from 'apps/web-app/constants';
import api from '../api';

export const getFocusAreas = async (type: string, queryParams: any) => {
  const query = objectToQueryString(queryParams ?? {});
  return await api.get(`${FILTER_API_ROUTES.FOCUS_AREA}?type=${type}&${query}`);
};


function objectToQueryString(obj: Record<string, any>): string {
  try {
  return Object.entries(obj)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  } catch (error) {
    console.error(error);
  }
}
