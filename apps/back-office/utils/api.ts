import axios, { AxiosRequestHeaders } from 'axios';
import { removeToken, getToken } from './auth';

const api = axios.create({
  baseURL: process.env.WEB_API_BASE_URL,
});


api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = getToken();
      if (token) {
        const headers = (config.headers ?? {}) as AxiosRequestHeaders;

        if (!headers.Authorization) {
          headers.Authorization = `Bearer ${token}`;
        }

        config.headers = headers;
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);


api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If we get a 401 Unauthorized response, the token has expired
    if (error.response?.status === 401) {
      removeToken();

      // Redirect to the login page if not already there
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }

    return Promise.reject(error);
  }
);

export default api;
