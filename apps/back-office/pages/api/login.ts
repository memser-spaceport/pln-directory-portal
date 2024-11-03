import api from '../../utils/api';
import { setCookie } from 'nookies';
import jwt_decode from 'jwt-decode';

interface DecodedJwtPayload {
  exp: number;
  iat: number;
}

export default async function login(req, res) {
  const { username, password } = req.body;
  await api
    .post('/v1/admin/auth/login', { username: username, password: password })
    .then((response) => {
      if (response?.data?.accessToken) {
        // Set the authentication cookie
        const decoded = jwt_decode<DecodedJwtPayload>(
          response.data.accessToken
        );
        const expiry = new Date(decoded?.exp * 1000);
        setCookie({ res }, 'plnadmin', response?.data?.accessToken, {
          expires: expiry,
          path: '/',
        });
        res.status(200).json({ success: true });
      } else {
        res.status(401).json({ success: false });
      }
    })
    .catch((err) => {
      console.log('catcherror', err.response.data.statusCode);
      if (err?.response?.data?.statusCode === 401) {
        res.status(401).json({ success: false });
      }
      // console.log('catcherror',err);
    });
}
