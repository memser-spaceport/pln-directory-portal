import api from '../api';

export const fetchTeams = async () => {
  try {
    const response = await api.get(`/v1/teams`);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.name };
      });
    }
  } catch (error) {
    console.error(error);
  }
};
