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

// Converts an isoDateTime string to a formatted date-time string in "DD/MM/YYYY, HH:MM" format.  
// Uses British English (en-GB) locale and 24-hour clock.
export const formatDateTime = (isoDateTime: string): string => {
  const date = new Date(isoDateTime);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return formatter.format(date);
};