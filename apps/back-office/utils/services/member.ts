import api from '../api';

export const fetchMember = async (id) => {
  try {
    const response = await api.get(`/v1/members/${id}`);
    if (response.data) {
      return response.data;
    }
  } catch (error) {
    console.error(error);
  }
};

export const fetchPendingMemberRequest = async (id) => {
  try {
    const response = await api.get(`/v1/participants-request/${id}`);
    if (response.data) {
      return response.data;
    }
  } catch (error) {
    console.error(error);
  }
};
