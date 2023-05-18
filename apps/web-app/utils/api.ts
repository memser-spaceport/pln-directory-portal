import axios from 'axios';
import Cookies from 'js-cookie';
import nookies from 'nookies';
import { setCookie } from 'nookies';
import { decodeToken, calculateExpiry } from '../utils/services/auth';


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
        .then((data) => {
          const { accessToken, refreshToken, userInfo } = data;
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
          return config;
        });
    }
    return config;
  } catch (error) {
    console.log(error);
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
      let { refreshToken } = nookies.get();
      if(refreshToken && refreshToken.length > 0 ) {
        refreshToken = refreshToken.replace(
          /"/g,
          ''
        );
        // Make a call to renew access token
        return renewAccessToken(refreshToken)
        .then((data) => {
          const { accessToken, refreshToken, userInfo } = data;
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
            originalRequest.headers.Authorization =
              `Bearer ${accessToken}`.replace(/"/g, '');
            return axios(originalRequest);
          }})
          .catch((error) => {
            Cookies.set('page_params', 'user_logged_out', { expires: 60, path: '/' });
            window.location.href="/directory/members";
            return Promise.reject(error);
          });
      }  else {
        Cookies.set('page_params', 'user_logged_out', { expires: 60, path: '/' });
        window.location.href="/directory/members";
      }   
    }
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
    `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/auth/token/refresh`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token : refreshToken }),
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
