import axios from "axios"

const api = axios.create({
    baseURL: `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth`
})


export const sendEmailOtp = async (payload, header) => {
    const result = await api.post(`/otp`, payload, header)
    return result.data;
}

export const resendEmailOtp = async (payload, header) => {
    const result = await api.put(`/otp`, payload, header)
    return result.data;
}

export const verifyEmailOtp = async (payload, header) => {
    const result = await api.post(`/otp/verify`, payload, header)
    return result.data;
}
