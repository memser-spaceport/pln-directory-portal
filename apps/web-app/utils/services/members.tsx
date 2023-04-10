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

export const requestPendingCheck = async (email) => {
  try {
    const data = {
      uniqueIdentifier: email,
      participantType: 'MEMBER',
    };

    const response = await api.post(
      `/participants-request/unique-identifier-checker`,
      data
    );
    if (response.data) {
      return response.data;
    }
  } catch (error) {
    console.error(error);
  }
};
