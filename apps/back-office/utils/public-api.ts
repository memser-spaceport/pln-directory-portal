import axios from 'axios';

/**
 * Axios instance for public (unauthenticated) API endpoints.
 * Does NOT attach the plnadmin token — use this for routes guarded by
 * UserTokenCheckGuard, which validates tokens via external introspect and
 * returns 401 if the admin JWT is sent.
 */
const publicApi = axios.create({
  baseURL: process.env.WEB_API_BASE_URL,
});

export default publicApi;
