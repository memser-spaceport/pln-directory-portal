import api from '../api';
import { API_ROUTE } from '../constants';

export type IrlGatheringLocationDto = {
  uid: string;
  location: string;
  country?: string | null;
};

export type TriggerIrlGatheringPushDto = {
  locationUid: string;
  kind: 'UPCOMING' | 'REMINDER';
};

/**
 * Load IRL gathering locations (admin).
 */
export const fetchIrlGatheringLocations = async (authToken: string): Promise<IrlGatheringLocationDto[]> => {
  const res = await api.get(API_ROUTE.ADMIN_IRL_GATHERING_PUSH_NOTIFICATIONS_LOCATIONS, {
    headers: { authorization: `Bearer ${authToken}` },
  });

  return (res?.data?.items ?? []) as IrlGatheringLocationDto[];
};

/**
 * Trigger manual IRL gathering push (admin).
 */
export const triggerIrlGatheringPush = async (payload: TriggerIrlGatheringPushDto, authToken: string) => {
  const res = await api.post(API_ROUTE.ADMIN_IRL_GATHERING_PUSH_NOTIFICATIONS_TRIGGER, payload, {
    headers: { authorization: `Bearer ${authToken}` },
  });

  return res?.data;
};
