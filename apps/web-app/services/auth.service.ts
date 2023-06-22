import axios from "axios"

export const sendEmailVerificationOtp = async (payload) => {
    const result = await axios.post(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/verification/send-otp`, payload)
    return result.data;
}

export const resendEmailVerificationOtp = async (payload) => {
    const result = await axios.post(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/verification/resend-otp`, payload)
    return result.data;
}

export const sendOtpForEmailChange = async (payload, headers) => {
    const result = await axios.post(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/change-email/send-otp`, payload, {headers})
    return result.data;
}

export const resendOtpForEmailChange = async (payload, headers) => {
    const result = await axios.post(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/change-email/resend-otp`, payload, {headers})
    return result.data;
}

export const validateEmailOtp = async (payload) => {
    const result = await axios.post(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/verification/verify-otp`, payload)
    return result.data;
}

export const verifyOtpForChangeEmail = async (payload, headers) => {
    const result = await axios.post(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/change-email/verify-otp`, payload, {headers})
    return result.data;
}

export const linkEmail = async (payload) => {
    const result = await axios.post(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/link-email`, payload)
    return result.data;
}

export const getClientToken = async (token) => {
    const result = await axios.get(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/clienttoken`, {headers: {Authorization: `Bearer ${token}`}})
    return result.data;
}