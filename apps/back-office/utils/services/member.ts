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

  const requestOptions = {
    method: 'POST',
    body: formData,
  };

  const response = await fetch(`${process.env.WEB_API_BASE_URL}/v1/images`, requestOptions);

  if (!response?.ok) {
    throw new Error(response?.statusText);
  }

  const result = await response?.json();

  return result;
};
