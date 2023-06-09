import api, { renewAccessToken } from '../api';
import Cookies from 'js-cookie';
import { setCookie } from 'nookies';
import * as Cookie from 'cookie'
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
    window.location.href = PAGE_ROUTES.TEAMS;
    await createLogoutChannel().close();
  };
};

export const convertCookiesToJson = (cookies) => {
  const jsonCookies = {};
  const parsedCookies = cookies.map(cookie => Cookie.parse(cookie));
  parsedCookies.forEach(cookie => {
    if (Object.keys(cookie)?.length) {
      const cookieName = Object.keys(cookie)[0];
      jsonCookies[cookieName] = cookie[cookieName];
    }
  });
  return jsonCookies;
};

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

export const renewAndStoreNewAccessToken = async (refrshToken, ctx) => {
  if (refrshToken) {
    refrshToken = refrshToken.replace(
      /"/g,
      ''
    );
    const resp = await renewAccessToken(refrshToken);
    const { accessToken, refreshToken, userInfo } = resp;
    try {
      if (accessToken && refreshToken && userInfo) {
        const access_token = decodeToken(accessToken);
        const refresh_token = decodeToken(refreshToken);
        setCookie(ctx, 'authToken', JSON.stringify(accessToken), {
          maxAge: calculateExpiry(access_token.exp),
          path: '/'
        });
        // ctx.req.cookies.authToken = accessToken;
        setCookie(ctx, 'refreshToken', JSON.stringify(refreshToken), {
          maxAge: calculateExpiry(refresh_token.exp),
          path: '/'
        });
        setCookie(ctx, 'userInfo', JSON.stringify(userInfo), {
          maxAge: calculateExpiry(access_token.exp),
          path: '/'
        });
      }
    } 
    catch(err) {
      console.log(err);
    }
  }
};
