import axios from 'axios';
import nookies from 'nookies';
import { setCookie } from 'nookies';
import { decodeToken, calculateExpiry } from '../utils/services/auth';
// Create an Axios instance with default configuration
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_WEB_API_BASE_URL,
});

// Add an interceptor for the getToken request to set the cookie
api.interceptors.request.use(async (config) => {
  if (config.method !== 'get') {
    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/token`
      );
      config.withCredentials = true;
      config.headers['csrf-token'] = res.data.token;
      let { authToken } = nookies.get();
      if (authToken && authToken.length > 0) {
        config.headers['Authorization'] = `Bearer ${authToken}`.replace(
          /"/g,
          ''
        );
      }
      return config;
    } catch (error) {
      return Promise.reject(error.message);
    }
  } else {
    return config;
  }
});

// Add a response interceptor to handle access token failure
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const originalRequest = error.config;
    if (error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const { refreshToken } = nookies.get();
      // Make a call to renew access token
      return renewAccessToken(refreshToken)
        .then((newAccessToken) => {
          // Update the access token and retry the original request
          const accessToken = decodeToken(newAccessToken);
          setCookie(null, 'authToken', JSON.stringify(newAccessToken), {
            maxAge: calculateExpiry(accessToken.exp),
            path: '/',
            // secure: true,
            // sameSite: 'strict',
          });
          originalRequest.headers.Authorization =
            `Bearer ${newAccessToken}`.replace(/"/g, '');
          return axios(originalRequest);
        })
        .catch((error) => {
          return Promise.reject(error);
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
  },
  function (error) {
    // This function will run for every error response.
    return Promise.reject(error);
  }
);

function getCsrfTokenFromResponseCookie(cookieHeader) {
  const csrfCookie = cookieHeader?.find((cookie) => cookie.includes('_csrf'));
  if (!csrfCookie) {
    return null;
  }
  return csrfCookie.split('=')[1];
}

function renewAccessToken(refreshToken) {
  // Make an API call to your server to get a new access token using refreshToken
  return fetch(
    `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}v1/auth/token/refresh`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
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
      return data.accessToken;
    });
}

// Export the configured Axios api
export default api;
