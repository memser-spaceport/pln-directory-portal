import axios from 'axios';

// Create an Axios instance with default configuration
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_WEB_API_BASE_URL,
});

export default api;