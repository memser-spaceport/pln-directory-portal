import api from '../api';
import { API_ROUTE } from '../constants';

interface AnalyticsEvent {
  name: string;
  distinctId: string;
  properties?: Record<string, unknown>;
}

export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  await api.post(API_ROUTE.ANALYTICS_TRACK, event);
}
