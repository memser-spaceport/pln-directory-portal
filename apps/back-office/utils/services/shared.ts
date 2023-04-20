import api from '../api';
import APP_CONSTANTS, { API_ROUTE, ENROLLMENT_TYPE } from '../constants';

export const fetchMembershipSources = async () => {
  try {
    const response = await api.get(API_ROUTE.MEMBERSHIP);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.title };
      });
    }
  } catch (error) {
    console.error(error);
  }
};

export const fetchProtocol = async () => {
  try {
    const response = await api.get(API_ROUTE.TECHNOLOGIES);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.title };
      });
    }
  } catch (error) {
    console.error(error);
  }
};

export const fetchSkills = async () => {
  try {
    const response = await api.get(API_ROUTE.SKILLS);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.title };
      });
    }
  } catch (error) {
    console.error(error);
  }
};

export const fetchFundingStages = async () => {
  try {
    const response = await api.get(API_ROUTE.FUNDING_STAGE);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.title };
      });
    }
  } catch (error) {
    console.error(error);
  }
};

export const fetchIndustryTags = async () => {
  try {
    const response = await api.get(API_ROUTE.INDUSTRIES);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.title };
      });
    }
  } catch (error) {
    console.error(error);
  }
};

export const getPendingClosedCount = async () => {
  try {
    const response = await api.get(API_ROUTE.PARTICIPANTS_REQUEST);
    if (response.data) {
      const memberOpen = response.data?.filter(
        (item) =>
          item.participantType === ENROLLMENT_TYPE.MEMBER &&
          item.status === APP_CONSTANTS.PENDING_LABEL
      ).length;
      console.log();
      const teamOpen = response.data?.filter(
        (item) =>
          item.participantType === ENROLLMENT_TYPE.TEAM &&
          item.status === APP_CONSTANTS.PENDING_LABEL
      ).length;
      const teamClosed = response.data?.filter(
        (item) =>
          item.participantType === ENROLLMENT_TYPE.TEAM &&
          item.status !== APP_CONSTANTS.PENDING_LABEL
      ).length;
      console.log();
      const memberClosed = response.data?.filter(
        (item) =>
          item.participantType === ENROLLMENT_TYPE.MEMBER &&
          item.status !== APP_CONSTANTS.PENDING_LABEL
      ).length;
      return {
        memberOpenCount: memberOpen,
        teamOpenCount: teamOpen,
        memberClosedCount: memberClosed,
        teamClosedCount: teamClosed,
      };
    }
  } catch (error) {
    console.error(error);
  }
};
