import api from '../api';
import { setCookie } from 'nookies';
import * as jwt from 'jsonwebtoken';

export const decodeToken = (token: string) => {
  return jwt.decode(token);
};

export const calculateExpiry = (tokenExpiry) => {
  console.log(Date.now());
  const exp = tokenExpiry - Date.now() / 1000;
  return exp;
};

export const generateOAuth2State = () => {
  const state =
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
  return state;
};

export const authenticate = async () => {
  try {
    const state = generateOAuth2State();
    setCookie(null, 'state', state, {
      path: '/',
      maxAge: 60 * 1000,
    });
    const redirectURL = 'http://localhost:4200/directory/members/verify-member';
    window.location.href = `http://localhost:3000/auth?redirect_uri=${redirectURL}&state=${state}`;
  } catch (error) {
    console.error(error);
  }
};

export const getAccessToken = async (code) => {
  try {
    // code denotes auth code for oauth.
    const response = await api.post(`/v1/auth/token`, { code });

    if (response.data && response.status === 201) {
      return {
        status: 201,
        data: response.data,
      };
    } else if (response.status === 401) {
      return {
        status: 401,
        msg: 'authentication error',
      };
    } else if (response.status === 403) {
      return {
        status: 403,
        msg: 'forbidden error',
      };
    }
  } catch (error) {
    console.error(error);
  }
};
