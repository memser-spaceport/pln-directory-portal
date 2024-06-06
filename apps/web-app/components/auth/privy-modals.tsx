import { useEffect, useState } from 'react';
import usePrivyWrapper from '../../hooks/auth/usePrivyWrapper';
import { toast } from 'react-toastify';
import axios from 'axios';
import { calculateExpiry, createLogoutChannel, decodeToken } from '../../utils/services/auth';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import { LOGOUT_MSG } from '../../constants';
import useAuthAnalytics from '../../analytics/auth.analytics';

function PrivyModals() {
  const {
    authenticated,
    getAccessToken,
    linkEmail,
    linkGithub,
    linkGoogle,
    linkWallet,
    login,
    logout,
    ready,
    unlinkEmail,
    updateEmail,
    user,
    PRIVY_CUSTOM_EVENTS,
  } = usePrivyWrapper();
  const analytics = useAuthAnalytics();
  const [linkAccountKey, setLinkAccountKey] = useState('');
  const router = useRouter();

  const clearPrivyParams = () => {
    const queryString = window.location.search.substring(1);
    const params = new URLSearchParams(queryString);
    let queryParams = `?`;
    params.forEach((value, key) => {
      if (!key.includes('privy_')) {
        queryParams = `${queryParams}${queryParams === '?' ? '' : '&'}${key}=${value}`;
      }
    });
    router.push(`${window.location.pathname}${queryParams === '?' ? '' : queryParams}`);
  };

  const getLinkedAccounts = (user) => {
    const userLinkedAccounts = user?.linkedAccounts ?? [];
    const linkedAccounts = userLinkedAccounts.map((account) => {
      const linkedType = account.type;
      if (linkedType === 'wallet') {
        return 'siwe';
      } else if (linkedType === 'google_oauth') {
        return 'google';
      } else if (linkedType === 'github_oauth') {
        return 'github';
      } else {
        return '';
      }
    });

    return linkedAccounts.filter((v) => v !== '').join(',');
  };

  const loginInUser = (output) => {
    if (output.userInfo?.isFirstTimeLogin) {
      router.push('/settings');
    }
    clearPrivyParams();
    setLinkAccountKey('');
    document.dispatchEvent(new CustomEvent('app-loader-status', { detail: false }));
    toast.success('Successfully Logged In', { hideProgressBar: true });
  };

  const saveTokensAndUserInfo = (output, user) => {
    const authLinkedAccounts = getLinkedAccounts(user);
    const accessTokenExpiry = decodeToken(output.accessToken);
    const refreshTokenExpiry = decodeToken(output.refreshToken);
    localStorage.removeItem('stateUid');
    Cookies.set('authToken', JSON.stringify(output.accessToken), {
      expires: new Date(accessTokenExpiry.exp * 1000),
      domain: process.env.COOKIE_DOMAIN || '',
    });

    Cookies.set('refreshToken', JSON.stringify(output.refreshToken), {
      expires: new Date(refreshTokenExpiry.exp * 1000),
      path: '/',
      domain: process.env.COOKIE_DOMAIN || '',
    });
    Cookies.set('userInfo', JSON.stringify(output.userInfo), {
      expires: new Date(accessTokenExpiry.exp * 1000),
      path: '/',
      domain: process.env.COOKIE_DOMAIN || '',
    });

    Cookies.set('authLinkedAccounts', JSON.stringify(authLinkedAccounts), {
      expires: new Date(refreshTokenExpiry.exp * 1000),
      path: '/',
      domain: process.env.COOKIE_DOMAIN || '',
    });
  };

  const deleteUser = async (errorCode) => {
    analytics.onPrivyUserDelete({ ...user, type: 'init' });
    const token = await getAccessToken();
    await axios.post(`${process.env.WEB_API_BASE_URL}/v1/auth/accounts/external/${user.id}`, { token: token });
    analytics.onPrivyUserDelete({ type: 'success' });
    setLinkAccountKey('');
    await logout();
    document.dispatchEvent(new CustomEvent('auth-invalid-email', { detail: errorCode }));
  };

  const handleInvalidDirectoryEmail = async () => {
    try {
      analytics.onDirectoryLoginFailure({ ...user, type: 'INVALID_DIRECTORY_EMAIL' });
      if (user?.email?.address && user?.linkedAccounts.length > 1) {
        analytics.onPrivyUnlinkEmail({ ...user, type: 'init' });
        await unlinkEmail(user?.email?.address);
        analytics.onPrivyUnlinkEmail({ type: 'success' });
        await deleteUser('');
      } else if (user?.email?.address && user?.linkedAccounts.length === 1) {
        setLinkAccountKey('');
        await deleteUser('');
      } else {
        await logout();
        document.dispatchEvent(new CustomEvent('auth-invalid-email'));
      }
    } catch (error) {
      document.dispatchEvent(new CustomEvent('auth-invalid-email'));
    }
  };

  const initDirectoryLogin = async () => {
    try {
      document.dispatchEvent(new CustomEvent('app-loader-status', { detail: true }));
      const privyToken = await getAccessToken();
      const result = await axios.post(`${process.env.WEB_API_BASE_URL}/v1/auth/token`, {
        exchangeRequestToken: privyToken,
        exchangeRequestId: localStorage.getItem('stateUid'),
        grantType: 'token_exchange',
      });

      if (result?.data?.isEmailChanged) {
        document.dispatchEvent(new CustomEvent('auth-info-modal', { detail: 'email_changed' }));
      } else {
        saveTokensAndUserInfo(result.data, user);
        loginInUser(result.data);
        analytics.onDirectoryLoginSuccess();
      }
    } catch (error) {

      document.dispatchEvent(new CustomEvent('app-loader-status', { detail: false }));
      if (user?.email?.address && error?.response?.status === 403) {
        await handleInvalidDirectoryEmail();
      } else {
        document.dispatchEvent(new CustomEvent('auth-invalid-email', { detail: 'unexpected_error' }));
        setLinkAccountKey('');
        await logout();
      }
    }
  };

  useEffect(() => {
    async function handlePrivyLoginSuccess(e) {
      const info = e.detail;
      analytics.onPrivyLoginSuccess(info?.user);
      // If email is not linked, link email mandatorily
      if (!info?.user?.email?.address) {
        setLinkAccountKey('email');
        return;
      }
      const stateUid = localStorage.getItem('stateUid');
      if (stateUid) {
        // If linked login user
        analytics.onDirectoryLoginInit({ ...info?.user, stateUid });
        await initDirectoryLogin();
      }
    }

    async function handlePrivyLinkSuccess(e) {
      const { linkMethod, linkedAccount } = e.detail;
      const authLinkedAccounts = getLinkedAccounts(e.detail.user);
      analytics.onPrivyLinkSuccess({ linkMethod, linkedAccount, authLinkedAccounts });
      if (linkMethod === 'email') {
        const userInfo = Cookies.get('userInfo');
        const accessToken = Cookies.get('accessToken');
        const refreshToken = Cookies.get('refreshToken');
        if (!userInfo && !accessToken && !refreshToken) {
          // Initiate Directory Login to validate email and login user
          const stateUid = localStorage.getItem('stateUid');
          analytics.onDirectoryLoginInit({ ...e?.detail?.user, stateUid, linkedAccount });
          await initDirectoryLogin();
        } else {
          document.dispatchEvent(new CustomEvent('app-loader-status', { detail: true }));
          document.dispatchEvent(
            new CustomEvent('directory-update-email', { detail: { newEmail: linkedAccount.address } })
          );
        }
      } else if (linkMethod === 'github') {
        document.dispatchEvent(new CustomEvent('new-auth-accounts', { detail: authLinkedAccounts }));
        toast.success('Github linked successfully', { hideProgressBar: true });
      } else if (linkMethod === 'google') {
        document.dispatchEvent(new CustomEvent('new-auth-accounts', { detail: authLinkedAccounts }));
        toast.success('Google linked successfully', { hideProgressBar: true });
      } else if (linkMethod === 'siwe') {
        document.dispatchEvent(new CustomEvent('new-auth-accounts', { detail: authLinkedAccounts }));
        toast.success('Wallet linked successfully', { hideProgressBar: true });
      }
      setLinkAccountKey('');
    }

    function handlePrivyLoginError(e) {
      console.log('Privy login error');
    }

    async function handlePrivyLinkError(e) {
      const userInfo = Cookies.get('userInfo');
      const accessToken = Cookies.get('accessToken');
      const refreshToken = Cookies.get('refreshToken');

      if (!userInfo && !accessToken && !refreshToken) {
        analytics.onAccountLinkError({ type: 'loggedout', error: e?.detail?.error });
        if (
          e?.detail?.error === 'linked_to_another_user' ||
          e?.detail?.error === 'exited_link_flow' ||
          e?.detail?.error === 'invalid_credentials'
        ) {
          try {
            await deleteUser(e?.detail?.error);
          } catch (err) {
            document.dispatchEvent(new CustomEvent('auth-invalid-email', { detail: e?.detail?.error }));
          }
        } else {
          await logout();
          setLinkAccountKey('');
          document.dispatchEvent(new CustomEvent('auth-invalid-email', { detail: 'unexpected_error' }));
        }
      } else {
        analytics.onAccountLinkError({ type: 'loggedin', error: e?.detail?.error });
      }
    }
    async function initPrivyLogin() {
      const stateUid = localStorage.getItem('stateUid');
      if (stateUid) {
        login();
      }
    }
    function addAccountToPrivy(e) {
      analytics.onPrivyAccountLink({ account: e?.detail });
      setLinkAccountKey(e.detail);
    }
    async function handlePrivyLogout() {
      Cookies.remove('authLinkedAccounts');
      await logout();
    }

    async function handlePrivyLogoutSuccess() {
      const isDirectory = localStorage.getItem('directory-logout');
      if (isDirectory) {
        localStorage.clear();
        toast.info(LOGOUT_MSG, {
          hideProgressBar: true,
        });
        createLogoutChannel().postMessage('logout');
      }
    }

    document.addEventListener('privy-init-login', initPrivyLogin);
    document.addEventListener('auth-link-account', addAccountToPrivy);
    document.addEventListener('init-privy-logout', handlePrivyLogout);
    document.addEventListener(PRIVY_CUSTOM_EVENTS.AUTH_LOGIN_SUCCESS, handlePrivyLoginSuccess);
    document.addEventListener(PRIVY_CUSTOM_EVENTS.AUTH_LINK_ACCOUNT_SUCCESS, handlePrivyLinkSuccess);
    document.addEventListener(PRIVY_CUSTOM_EVENTS.AUTH_LOGIN_ERROR, handlePrivyLoginError);
    document.addEventListener(PRIVY_CUSTOM_EVENTS.AUTH_LINK_ERROR, handlePrivyLinkError);
    document.addEventListener('privy-logout-success', handlePrivyLogoutSuccess);
    return function () {
      document.removeEventListener('privy-init-login', initPrivyLogin);
      document.removeEventListener('auth-link-account', addAccountToPrivy);
      document.removeEventListener('init-privy-logout', handlePrivyLogout);
      document.removeEventListener(PRIVY_CUSTOM_EVENTS.AUTH_LOGIN_SUCCESS, handlePrivyLoginSuccess);
      document.removeEventListener(PRIVY_CUSTOM_EVENTS.AUTH_LINK_ACCOUNT_SUCCESS, handlePrivyLinkSuccess);
      document.removeEventListener(PRIVY_CUSTOM_EVENTS.AUTH_LOGIN_ERROR, handlePrivyLoginError);
      document.removeEventListener(PRIVY_CUSTOM_EVENTS.AUTH_LINK_ERROR, handlePrivyLinkError);
      document.removeEventListener('privy-logout-success', handlePrivyLogoutSuccess);
    };
  }, [user, login, logout, ready]);

  /**** FIX NEEDED: Currently privy link methods throws errors when called directly. Requires useEffect based setup like below *****/
  useEffect(() => {
    if (linkAccountKey === 'github') {
      linkGithub();
      setLinkAccountKey('');
    } else if (linkAccountKey === 'google') {
      linkGoogle();
      setLinkAccountKey('');
    } else if (linkAccountKey === 'siwe') {
      linkWallet();
      setLinkAccountKey('');
    } else if (linkAccountKey === 'email') {
      linkEmail();
      setLinkAccountKey('');
    } else if (linkAccountKey === 'updateEmail') {
      updateEmail();
        setLinkAccountKey('');
    }
  }, [linkAccountKey]);

  return (
    <>
      <style jsx global>
        {`
          #privy-modal-content {
            overflow-y: auto !important;
            scrollbar-width: thin;
          }
          
          #privy-modal-content img[alt='PL Network logo'] {
            max-width: none !important;
            width: 100% !important;
            object-fit: cover;
            object-position: top;
            margin: 0;
            padding: 0;
            max-height: fit-content !important;
          }

          div:has(> img[alt='PL Network logo']) {
            padding: 0;
          }

          #privy-modal-content img[alt='Protocol Labs logo'] {
            max-width: none !important;
            width: 100% !important;
            object-fit: cover;
            object-position: top;
            margin: 0;
            padding: 0;
            max-height: fit-content !important;
          }

          div:has(> img[alt='Protocol Labs logo']) {
            padding: 0;
          }

          .hide-on-mobile {
            display: none !important;
          }
        `}
      </style>
    </>
  );
}

export default PrivyModals;
