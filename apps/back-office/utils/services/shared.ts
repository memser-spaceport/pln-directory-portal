import api from '../api';
import { API_ROUTE } from '../constants';

export const fetchMembershipSources = async () => {
  try {
    const response = await api.get(API_ROUTE.MEMBERSHIP);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.title };
      });
    }
  } catch (error) {
    console.error(error);
  }
};

export const fetchProtocol = async () => {
  try {
    const response = await api.get(API_ROUTE.TECHNOLOGIES);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.title };
      });
    }
  } catch (error) {
    console.error(error);
  }
};

export const fetchSkills = async () => {
  try {
    const response = await api.get(API_ROUTE.SKILLS);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.title };
      });
    }
  } catch (error) {
    console.error(error);
  }
};

export const fetchFundingStages = async () => {
  try {
    const response = await api.get(API_ROUTE.FUNDING_STAGE);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.title };
      });
    }
  } catch (error) {
    console.error(error);
  }
};

export const fetchIndustryTags = async () => {
  try {
    const response = await api.get(API_ROUTE.INDUSTRIES);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.title };
      });
    }
  } catch (error) {
    console.error(error);
  }
};
