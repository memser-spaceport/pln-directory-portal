import api from '../api';
import { API_ROUTE } from '../constants';

export type IrlGatheringPushConfigDto = {
  uid: string;
  isActive: boolean;
  enabled: boolean;
  minAttendeesPerEvent: number;
  upcomingWindowDays: number;
  reminderDaysBefore: number;
  updatedByMemberUid?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdateIrlGatheringPushConfigDto = {
  isActive?: boolean;
  enabled?: boolean;
  minAttendeesPerEvent?: number;
  upcomingWindowDays?: number;
  reminderDaysBefore?: number;
};

/**
 * Get active IRL gathering push config (admin).
 */
export const fetchActiveIrlGatheringPushConfig = async (authToken: string): Promise<IrlGatheringPushConfigDto | null> => {
  try {
    const response = await api.get(API_ROUTE.ADMIN_IRL_GATHERING_PUSH_CONFIG_ACTIVE, {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    return response?.data ?? null;
  } catch (error) {
    console.error('[fetchActiveIrlGatheringPushConfig] error:', error);
    throw error; // important: let page handle 403/logout and show message
  }
};

/**
 * Update IRL gathering push config by UID (admin).
 */
export const updateIrlGatheringPushConfig = async (
  uid: string,
  payload: UpdateIrlGatheringPushConfigDto,
  authToken: string
): Promise<IrlGatheringPushConfigDto> => {
  try {
    const response = await api.patch(`${API_ROUTE.ADMIN_IRL_GATHERING_PUSH_CONFIG}/${uid}`, payload, {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error('[updateIrlGatheringPushConfig] error:', error);
    throw error;
  }
};
