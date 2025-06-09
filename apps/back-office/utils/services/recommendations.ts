import { parseCookies } from 'nookies';
import api from '../api';
import { API_ROUTE } from '../constants';

export interface RecommendationNotification {
  id: string;
  email: string;
  targetMember: {
    name: string;
    uid: string;
  };
  createdAt: string;
  numberOfRecommendations: number;
  recommendationRun: RecommendationRun;
  recommendations: Array<Recommendation>;
  sentAt: string;
}

export interface Recommendation {
  uid: string;
  recommendedMember: {
    name: string;
    uid: string;
    createdAt: string;
  };
  score: number;
  status: string;
  factors: {
    sameTeam: boolean;
    previouslyRecommended: boolean;
    bookedOH: boolean;
    sameEvent: boolean;
    teamFocusArea: boolean;
    teamFundingStage: boolean;
    roleMatch: boolean;
    teamTechnology: boolean;
    hasOfficeHours: boolean;
    joinDateScore: number;
    teamIndustryTag: boolean;
    matchedFocusAreas: string[];
    matchedFundingStages: string[];
    matchedRoles: string[];
    matchedTechnologies: string[];
    matchedIndustryTags: string[];
  };
}

export interface RecommendationRun {
  uid: string;
  targetMember: {
    name: string;
    uid: string;
    email: string;
  };
  status: string;
  createdAt: string;
  recommendations: Recommendation[];
}

export const fetchRecommendationNotifications = async (): Promise<RecommendationNotification[]> => {
  try {
    const { plnadmin } = parseCookies();
    const config = {
      headers: {
        authorization: `Bearer ${plnadmin}`,
      },
    };
    const response = await api.get(`${API_ROUTE.ADMIN_RECOMMENDATIONS}/notifications`, config);
    return response.data;
  } catch (error) {
    console.error('Error fetching recommendation notifications:', error);
    return [];
  }
};

export const fetchRecommendationRuns = async (): Promise<RecommendationRun[]> => {
  try {
    const { plnadmin } = parseCookies();
    const config = {
      headers: {
        authorization: `Bearer ${plnadmin}`,
      },
    };
    const response = await api.get(`${API_ROUTE.ADMIN_RECOMMENDATIONS}/runs`, config);
    return response.data;
  } catch (error) {
    console.error('Error fetching recommendation runs:', error);
    return [];
  }
};

export const fetchRecommendationRun = async (uid: string): Promise<RecommendationRun> => {
  try {
    const { plnadmin } = parseCookies();
    const config = {
      headers: {
        authorization: `Bearer ${plnadmin}`,
      },
    };
    const response = await api.get(`${API_ROUTE.ADMIN_RECOMMENDATIONS}/runs/${uid}`, config);
    return response.data;
  } catch (error) {
    console.error('Error fetching recommendation run:', error);
    return null;
  }
};
