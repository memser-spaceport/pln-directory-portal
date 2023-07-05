import axios from "axios"

const api = axios.create({
    baseURL: `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/member`
})

export const sendOtpToChangeEmail = async (payload, uid, header) => {
    const result = await api.post(`/${uid}/email/otp`, payload, header)
    return result.data;
}

export const verifyAndProcessEmailChange = async (payload, uid, header) => {
    const result = await api.patch(`/${uid}/email`, payload, header)
    return result.data;
}
