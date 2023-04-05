import api from '../api';

export const fetchTeam = async (id) => {
  try {
    const response = await api.get(`/v1/teams/${id}`);
    if (response.data) {
      console.log('data', response.data);
      return response.data;
    }
  } catch (error) {
    console.error(error);
  }
};
