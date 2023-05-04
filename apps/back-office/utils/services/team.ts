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

export const fetchTeamsForAutocomplete = async (searchTerm) => {
  try {
    const response = await api.get(`/v1/teams?name__istartswith=${searchTerm}`);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.name };
      });
    }
  } catch (error) {
    console.error(error);
  }
};