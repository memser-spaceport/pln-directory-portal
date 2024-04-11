import Cookies from 'js-cookie';

export const parseCookie = (cookie) => {
  try {
    return JSON.parse(cookie);
  } catch (err) {
    return '';
  }
};

export const getUserInfo = () => {
  const userInfo = parseCookie(Cookies.get('userInfo'));

  if (userInfo) {
    return {
      name: userInfo?.name,
      email: userInfo?.email,
      roles: userInfo?.roles,
    };
  } else {
    return {};
  }
};
