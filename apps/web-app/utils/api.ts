import axios from 'axios';

console.log('process.env>>>>', process.env)

const api = axios.create({
  baseURL: 'http://localhost:3001',
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error.response)
);

export default api;
