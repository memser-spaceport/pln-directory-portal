import api from "../utils/api";

export const updatePreference = async (uid,payload,token) => {
    const result = await api.patch(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/member/${uid}/preferences`, payload, { headers: { Authorization: `Bearer ${token}` } });
    return result.data;
}

export const getPreferences = async (uid,token) => {
    const result = await api.get(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/members/${uid}/preferences`, { headers: { Authorization: `Bearer ${token}` } });
    return result.data;
}


export const sendOtpToChangeEmail = async (payload, uid, header) => {
    const result = await api.post(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/members/${uid}/email/otp`, payload, header)
    return result.data;
}

export const verifyAndProcessEmailChange = async (payload, uid, header) => {
    const result = await api.patch(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/members/${uid}/email`, payload, header)
    return result.data;
}

export const findRoleByName = async (params) => {
    const result = await api.get(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/members/roles`,params);
    return result.data;
}