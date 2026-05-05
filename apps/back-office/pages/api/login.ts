import type { NextApiRequest, NextApiResponse } from 'next';
import api from '../../utils/api';
import { setCookie } from 'nookies';
import jwt_decode from 'jwt-decode';

interface DecodedJwtPayload {
  exp: number;
  iat: number;
  roles?: string[];
  permissions?: string[];
  effectivePermissionCodes?: string[];
}

interface VerifyOtpBody {
  otpToken?: string;
  code?: string;
}

export default async function login(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ success: false, message: 'Method not allowed' });
  }

  const { otpToken, code } = req.body as VerifyOtpBody;

  if (!otpToken || !code) {
    return res.status(400).json({
      success: false,
      message: 'otpToken and code are required',
    });
  }

  try {
    // Call directory service OTP verification endpoint
    const response = await api.post('/v1/admin/auth/otp/verify', {
      otpToken,
      code,
    });

    const authToken = response?.data?.authToken;
    const refreshToken = response?.data?.refreshToken;
    const user = response?.data?.user;

    if (!authToken) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is missing in response',
      });
    }

    // Decode token to calculate cookie expiration time and RBAC v2 permissions.
    let expiry: Date | undefined = undefined;
    let decodedToken: DecodedJwtPayload | null = null;
    try {
      decodedToken = jwt_decode<DecodedJwtPayload>(authToken);
      if (decodedToken?.exp) {
        expiry = new Date(decodedToken.exp * 1000);
      }
    } catch (decodeError) {
      console.error('[login/otpVerify] Failed to decode auth token', decodeError);
    }

    const tokenPermissionCodes = decodedToken?.effectivePermissionCodes ?? decodedToken?.permissions ?? [];
    const enrichedUser = user
      ? {
          ...user,
          roles: user.roles ?? decodedToken?.roles ?? [],
          permissions: user.permissions ?? tokenPermissionCodes,
          effectivePermissionCodes: user.effectivePermissionCodes ?? tokenPermissionCodes,
        }
      : user;

    // This cookie is used by back-office as admin auth token
    setCookie({ res }, 'plnadmin', authToken, {
      expires: expiry,
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
    });

    // Store user info with RBAC v2 permissions for UI access control.
    if (enrichedUser) {
      setCookie({ res }, 'plnadmin_user', JSON.stringify(enrichedUser), {
        expires: expiry,
        path: '/',
        httpOnly: false,
        sameSite: 'lax',
      });
    }

    // Optional: store refresh token in a separate cookie (may be used later)
    if (refreshToken) {
      setCookie({ res }, 'plnadmin_refresh', refreshToken, {
        expires: expiry,
        path: '/',
        httpOnly: false,
        sameSite: 'lax',
      });
    }

    return res.status(200).json({
      success: true,
      user: enrichedUser,
    });
  } catch (err: any) {
    console.error(
      '[login/otpVerify] Error verifying OTP',
      err?.response?.data || err?.message
    );

    if (err?.response?.status === 401) {
      return res.status(401).json({
        success: false,
        message: 'Invalid OTP code',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
}
