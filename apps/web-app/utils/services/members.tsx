import { ENROLLMENT_TYPE } from '../../constants';
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

export const fetchMembers = async (query) => {
  try {
    const { searchBy } = query;
    const response = await api.get(
      `/v1/members?name__istartswith=${searchBy}` +
        `&select=uid,name,image.url,email&maskMemberEmail=true`
    );
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
      participantType: ENROLLMENT_TYPE.MEMBER,
    };

    const response = await api.post(
      `/v1/participants-request/unique-identifier`,
      data
    );
    if (response.data) {
      return response.data;
    }
  } catch (error) {
    console.error(error);
  }
};
