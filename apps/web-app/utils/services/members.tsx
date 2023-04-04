import axios from 'axios';
const API_URL = `http://localhost:3001`;

export const fetchMember = async (id) => {
  try {
    const response = await axios.get(`${API_URL}/v1/members/${id}`);
    if (response.data) {
      console.log('data', response.data);
      return response.data;
    }
  } catch (error) {
    console.error(error);
  }
};

export const requestPendingCheck = async (email) => {
  try {
    const data = {
      uniqueIdentifier: email,
      participantType: 'MEMBER',
    };
    const response = await axios.post(
      `${API_URL}/participants-request/unique-identifier-checker`,
      data
    );
    if (response.data) {
      console.log('requesttttdata', response.data);
      return response.data;
    }
  } catch (error) {
    console.error(error);
  }
};
