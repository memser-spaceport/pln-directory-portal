import api from '../api';
import { setCookie } from 'nookies';
import * as jwt from 'jsonwebtoken';
import { PAGE_ROUTES } from '../../constants';
import { BroadcastChannel } from 'broadcast-channel';

export const createLogoutChannel = () => {
  try {
    const logoutChannel = new BroadcastChannel('logout');
    return logoutChannel;
  } catch(err) {
    console.log(err);
  }
};

export const logoutAllTabs = () => {
  createLogoutChannel().onmessage = async (msg) => {
    window.location.href = PAGE_ROUTES.MEMBERS;
    await createLogoutChannel().close();
  };
}

export const decodeToken = (token: string):any => {
  return jwt.decode(token);
};

export const calculateExpiry = (tokenExpiry) => {
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
    const redirectURL = `${location.protocol + '//' + location.host}/directory/members/verify-member`;
    window.location.href = `${process.env.AUTH_API_URL}/auth?redirect_uri=${redirectURL}&state=${state}&scope=openid profile&client_id=${process.env.NEXT_PUBLIC_AUTH_APP_CLIENT_ID}`;
  } catch (error) {
    console.error(error);
  }
};

export const getAccessToken = async (code) => {
  try {
    // code denotes auth code for oauth.
    const response = await api.post(`/v1/auth/token`, { code });
    if (response) {
      return {
        status: 201,
        data: response.data,
      };
    }
  } catch (error) {
    if (error.response) {
      return error.response;
    }
  }
  return {
    status: 400,
    data: {}
  }
};
