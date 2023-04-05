import axios from 'axios';

// Create an Axios instance with default configuration
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_WEB_API_BASE_URL,
});

// Add an interceptor for the getToken request to set the cookie
api.interceptors.request.use(async (config) => {
  if (config.method !== 'GET') {
    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/token`
      );
      config.withCredentials = true;
      // config.headers['cookie'] = `token=${token}`;
      config.headers['csrf-token'] = res.data.token;
      return config;
    } catch (error) {
      return Promise.reject(error.message);
    }
  } else {
    return config;
  }
});

// Add an interceptor for all responses to set the CSRF token
api.interceptors.response.use((response) => {
  // const csrfToken = response['set-cookie'];
  // console.log('response.headers>>>', csrfToken);
  // if (csrfToken) {
  //   axios.defaults.headers.common['x-csrf-token'] = csrfToken;
  // }
  return response;
});

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

// Export the configured Axios api
export default api;
