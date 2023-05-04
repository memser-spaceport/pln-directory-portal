import api from '../api';

export const fetchSkills = async () => {
  try {
    const response = await api.get(`/v1/skills`);
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
    const response = await api.get(`/v1/teams`);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.name };
      });
    }
  } catch (error) {
    console.error(error);
  }
};


export const fetchTeamsForAutocomplete = async (searchTerm) => {
  try {
    const response = await api.get(`/v1/teams?name__istartswith=${searchTerm}`);
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
    const response = await api.get(`/v1/membership-sources`);
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
    const response = await api.get(`/v1/technologies`);
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
    const response = await api.get(`/v1/funding-stages`);
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
    const response = await api.get(`/v1/industry-tags`);
    if (response.data) {
      return response.data.map((item) => {
        return { value: item.uid, label: item.title };
      });
    }
  } catch (error) {
    console.error(error);
  }
};
