import api from "../utils/api";

export const updatePreference = async (uid,payload,token) => {
    const result = await api.patch(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/member/${uid}/preferences`, payload, { headers: { Authorization: `Bearer ${token}` } });
    return result.data;
}

export const getPreferences = async (uid,token) => {
    const result = await api.get(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/member/${uid}/preferences`, { headers: { Authorization: `Bearer ${token}` } });
    return result.data;
}