import axios from 'axios';
const API_URL = `http://localhost:3001/v1`;

export const fetchMember = async (id) => {
  console.log('iddddddddddddd', id);
  try {
    const response = await axios.get(`${API_URL}/members/${id}`);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.title };
      });
    }
  } catch (error) {
    console.error(error);
  }
};
