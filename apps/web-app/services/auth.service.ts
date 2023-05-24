import axios from "axios"

export const sendEmailVerificationOtp = async (payload) => {
    const result = await axios.post(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/verification/send-otp`, payload)
    return result.data;
}

export const validateEmailOtp = async (payload) => {
    const result = await axios.post(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/verification/verify-otp`, payload)
    return result.data;
}

export const linkEmail = async (payload) => {
    const result = await axios.post(`${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/link-email`, payload)
    return result.data;
}