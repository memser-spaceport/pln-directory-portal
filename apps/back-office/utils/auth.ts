import { NextApiRequest, NextApiResponse } from 'next';

export function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set the cookie with an expiry date
  const expiryDate = new Date('2023-04-30T00:00:00Z'); // replace with your desired expiry date
  const cookieValue = 'myValue'; // replace with your desired cookie value

  // Convert the expiry date to a UTC string
  const expires = expiryDate.toUTCString();

  // Set the cookie in the response header
  res.setHeader(
    'Set-Cookie',
    `myCookie=${cookieValue}; Expires=${expires}; Path=/` // replace with your desired cookie name, value, and path
  );

  // Return your response
  res.status(200).json({ message: 'Cookie set with expiry date successfully' });
}

export function setToken(token) {
  localStorage.setItem('back-office', token);
}

export function getToken() {
  return localStorage.getItem('back-office');
}

export function removeToken() {
  document.cookie = 'plnadmin=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
}
