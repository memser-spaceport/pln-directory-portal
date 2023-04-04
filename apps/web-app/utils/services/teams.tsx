import axios from 'axios';
const API_URL = `http://localhost:3001`;

export const fetchTeam = async (id) => {
  try {
    const response = await axios.get(`${API_URL}/v1/teams/${id}`);
    if (response.data) {
      console.log('data', response.data);
      return response.data;
    }
  } catch (error) {
    console.error(error);
  }
};