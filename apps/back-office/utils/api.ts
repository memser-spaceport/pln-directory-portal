import axios from 'axios';
import { removeToken } from './auth';

// Create an Axios instance with default configuration
const api = axios.create({
  baseURL: process.env.WEB_API_BASE_URL,
});

// Add a response interceptor to handle 401 Unauthorized errors
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
