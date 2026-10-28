import api from '../api';
import { API_ROUTE } from '../constants';

export const fetchMember = async (id) => {
  try {
    const response = await api.get(`${API_ROUTE.MEMBERS}/${id}`);
    if (response.data) {
      return response.data;
    }
  } catch (error) {
    console.error(error);
  }
};

export const fetchPendingMemberRequest = async (id) => {
  try {
    const response = await api.get(`${API_ROUTE.PARTICIPANTS_REQUEST}/${id}`);
    if (response.data) {
      return response.data;
    }
  } catch (error) {
    console.error(error);
  }
};

export const saveRegistrationImage = async (payload: any) => {
  const formData = new FormData();

  formData.append('file', payload);

  const response = await api.post('/v1/admin/images', formData, {
    headers: { 'content-type': 'multipart/form-data' },
  });

  return response.data;
};
