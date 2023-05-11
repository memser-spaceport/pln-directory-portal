import { ENROLLMENT_TYPE } from '../../constants';
import api from '../api';

export const fetchTeam = async (id) => {
  try {
    const response = await api.get(`/v1/teams/${id}`);
    if (response.data) {
      return response.data;
    }
  } catch (error) {
    console.error(error);
  }
};

export const editTeamRequestPendingCheck = async (name) => {
  try {
    const data = {
      uniqueIdentifier: name,
      participantType: ENROLLMENT_TYPE.TEAM,
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
