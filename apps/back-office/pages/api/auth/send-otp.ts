import type { NextApiRequest, NextApiResponse } from 'next';
import api from '../../../utils/api';

type SendOtpRequestBody = {
  email?: string;
};

export default async function sendOtp(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ success: false, message: 'Method not allowed' });
  }

  const { email } = req.body as SendOtpRequestBody;

  if (!email) {
    return res
      .status(400)
      .json({ success: false, message: 'Email is required' });
  }

  try {
    // Proxy call to directory service
    const response = await api.post('/v1/admin/auth/otp', { email });

    const otpToken = response?.data?.otpToken;

    if (!otpToken) {
      // We expect directory service to return { otpToken: string }
      return res.status(500).json({
        success: false,
        message: 'OTP token is missing in response from auth service',
      });
    }

    return res.status(200).json({
      success: true,
      otpToken,
    });
  } catch (error: any) {
    console.error(
      '[sendOtp] Failed to request OTP',
      error?.response?.data || error?.message
    );

    const status = error?.response?.status ?? 500;
    const errorMessage = error?.response?.data?.message || 'Failed to request OTP';

    return res.status(status).json({
      success: false,
      message: errorMessage,
    });
  }
}
