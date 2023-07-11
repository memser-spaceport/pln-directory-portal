import axios from 'axios';
import Cookies from 'js-cookie';
import nookies from 'nookies';
import { setCookie } from 'nookies';
import { decodeToken, calculateExpiry } from '../utils/services/auth';
import { toast } from 'react-toastify';
import { createLogoutChannel } from '../utils/services/auth';
import { PAGE_ROUTES , FORBIDDEN_ERR_MSG, BAD_REQUEST_ERR_MSG, NETWORK_ERR_MSG, SOMETHING_WENT_WRONG, RETRY_LOGIN_MSG } from '../constants';

// Ignore auth to urls
const authIgnoreURLS = ["/v1/auth/token", "/v1/participants-request/unique-identifier"];

// Create an Axios instance with default configuration
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_WEB_API_BASE_URL,
});

// Get Csrf token from server and add it in every post request.
// An interceptor to get authToken from cookie and set it to every request header.
api.interceptors.request.use(async (config) => {
  try {
    if (config.method != "get") {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/token`
      );
      config.withCredentials = true;
      config.headers['csrf-token'] = res.data.token;
    }
    if (authIgnoreURLS.includes(config.url) || config.method === "get"){
      return config;
    }
    const { authToken } = nookies.get();
    let { refreshToken } = nookies.get();
    if (authToken && authToken.length > 0) {
      config.headers['Authorization'] = `Bearer ${authToken}`.replace(
        /"/g,
        ''
      );
    } else if(refreshToken && refreshToken.length > 0 ) {
      refreshToken = refreshToken.replace(
        /"/g,
        ''
      );
      // Make a call to renew access token using refresh token.
      return renewAccessToken(refreshToken)
        .then((resp) => {
          const accessToken =  resp?.accessToken;
          const refreshToken =  resp?.refreshToken;
          const userInfo = resp?.userInfo;
          if (accessToken && refreshToken) {
            const access_token = decodeToken(accessToken);
            const refresh_token = decodeToken(refreshToken);

            setCookie(null, 'authToken', JSON.stringify(accessToken), {
              maxAge: calculateExpiry(access_token.exp),
              path: '/'
            });
            setCookie(null, 'refreshToken', JSON.stringify(refreshToken), {
              maxAge: calculateExpiry(refresh_token.exp),
              path: '/'
            });
            setCookie(null, 'userInfo', JSON.stringify(userInfo), {
              maxAge: calculateExpiry(access_token.exp),
              path: '/'
            });
            config.headers['Authorization'] = `Bearer ${accessToken}`.replace(
              /"/g,
              ''
            );
          } 
          return config;
        }).catch((error) => {
          throw error;
        });
    }
    return config;
  } catch (error) {
    console.log('Request Interceptor Error Info', error);
    toast.info(SOMETHING_WENT_WRONG, {
      hideProgressBar: true
    });
    return Promise.reject(error);
  }
});

// Add a response interceptor to handle access token failure
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const { response } = error;
    let msg = SOMETHING_WENT_WRONG;
    if (response) {
      if (response.status === 401) {
        Cookies.remove('authToken');
        Cookies.remove('refreshToken');
        Cookies.remove('userInfo');
        toast.info(RETRY_LOGIN_MSG, {
          hideProgressBar: true
        });
        createLogoutChannel().postMessage('logout');
        window.location.href = PAGE_ROUTES.TEAMS;
      } else if (response.status === 403) {
        msg = response?.data?.message ? response?.data?.message : FORBIDDEN_ERR_MSG;
      } else if (response.status === 400) {
        msg = response?.data?.message ? response?.data?.message : BAD_REQUEST_ERR_MSG;
      } else if (response.status === 404) {
        msg = NETWORK_ERR_MSG;
      } 
    } else if (error.request) {
      msg = SOMETHING_WENT_WRONG;
    }
    if (response?.status != 401) { 
      toast.error(msg, {
        hideProgressBar: true
      });
    }
    return Promise.reject(error);
  }
);

axios.interceptors.response.use(
  function (response) {
    // This function will run for every successful response.
    const csrfToken = getCsrfTokenFromResponseCookie(
      response.headers['set-cookie']
    );
    return response;
  }
);

function getCsrfTokenFromResponseCookie(cookieHeader) {
  const csrfCookie = cookieHeader?.find((cookie) => cookie.includes('_csrf'));
  if (!csrfCookie) {
    return null;
  }
  return csrfCookie.split('=')[1];
}

export function renewAccessToken(refreshToken) {
  // Make an API call to your server to get a new access token using refreshToken
  return fetch(
      `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken, grantType: 'refresh_token' }),
      }
    )
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to get new access token');
      }
      return response.json();
    })
    .then((data) => {
      // Return the new access token
      return data;
    });
}

// Export the configured Axios api
export default api;
