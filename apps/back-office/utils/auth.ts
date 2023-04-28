export function setToken(token) {
  localStorage.setItem('back-office', token);
}

export function getToken() {
  const match = document.cookie.match(
    new RegExp('(^| )' + 'plnadmin' + '=([^;]+)')
  );
  if (match) return match[2];
}

export function removeToken() {
  document.cookie = 'plnadmin=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
}
