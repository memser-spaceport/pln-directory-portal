export function setToken(token) {
  localStorage.setItem('back-office', token);
}

export function getToken() {
  return localStorage.getItem('back-office');
}

export function removeToken() {
  localStorage.removeItem('back-office');
}
