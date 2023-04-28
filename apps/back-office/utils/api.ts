import axios from 'axios';
import { getToken } from './auth';

// Create an Axios instance with default configuration
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_WEB_API_BASE_URL,
  // headers: {'authorization': `foobar ${getToken()}`}
});

export default api;
