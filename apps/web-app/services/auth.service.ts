import api from "../utils/api";


export const sendEmailOtp = async (payload, header) => {
    const result = await api.post(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/otp`, payload, header)
    return result.data;
}

export const resendEmailOtp = async (payload, header) => {
    const result = await api.put(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/otp`, payload, header)
    return result.data;
}

export const verifyEmailOtp = async (payload, header) => {
    const result = await api.post(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/otp/verify`, payload, header)
    return result.data;
}
