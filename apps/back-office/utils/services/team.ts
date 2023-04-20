import api from '../api';
import { API_ROUTE } from '../constants';

export const fetchTeams = async () => {
  try {
    const response = await api.get(API_ROUTE.TEAMS);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.name };
      });
    }
  } catch (error) {
    console.error(error);
  }
};
