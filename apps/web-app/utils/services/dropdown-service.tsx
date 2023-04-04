import axios from 'axios';
const API_URL = `http://localhost:3001/v1`;

export const fetchSkills = async () => {
  try {
    const response = await axios.get(`${API_URL}/skills`);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.title };
      });
    }
  } catch (error) {
    console.error(error);
  }
};

export const fetchTeams = async () => {
  try {
    const response = await axios.get(`${API_URL}/teams`);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.name };
      });
    }
  } catch (error) {
    console.error(error);
  }
};

export const fetchMembershipSources = async () => {
  try {
    const response = await axios.get(`${API_URL}/membership-sources`);
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
    const response = await axios.get(`${API_URL}/technologies`);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.name };
      });
    }
  } catch (error) {
    console.error(error);
  }
};

export const fetchFundingStages = async () => {
  try {
    const response = await axios.get(`${API_URL}/funding-stages`);
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
    const response = await axios.get(`${API_URL}/industry-tags`);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.title };
      });
    }
  } catch (error) {
    console.error(error);
  }
};
