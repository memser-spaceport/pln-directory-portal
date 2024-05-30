import { useEffect, useState } from 'react';
import usePrivyWrapper from '../../hooks/auth/usePrivyWrapper';
import { toast } from 'react-toastify';
import axios from 'axios';
import { calculateExpiry, createLogoutChannel, decodeToken } from '../../utils/services/auth';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import { LOGOUT_MSG } from 'apps/web-app/constants';
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
    document.dispatchEvent(new CustomEvent('app-loader-status', {detail: false}))
    toast.success('Successfully Logged In', { hideProgressBar: true });
  };

  const saveTokensAndUserInfo = (output, user) => {
    const authLinkedAccounts = getLinkedAccounts(user);
    const accessTokenExpiry = decodeToken(output.accessToken);
    const refreshTokenExpiry = decodeToken(output.refreshToken);
    localStorage.removeItem('stateUid');
    Cookies.set('authToken', JSON.stringify(output.accessToken), {
      expires: calculateExpiry(new Date(accessTokenExpiry.exp)),
      domain: process.env.COOKIE_DOMAIN || '',
    });

    Cookies.set('refreshToken', JSON.stringify(output.refreshToken), {
      expires: calculateExpiry(new Date(refreshTokenExpiry.exp)),
      path: '/',
      domain: process.env.COOKIE_DOMAIN || '',
    });
    Cookies.set('userInfo', JSON.stringify(output.userInfo), {
      expires: calculateExpiry(new Date(accessTokenExpiry.exp)),
      path: '/',
      domain: process.env.COOKIE_DOMAIN || '',
    });

    Cookies.set('authLinkedAccounts', JSON.stringify(authLinkedAccounts), {
      expires: calculateExpiry(new Date(refreshTokenExpiry.exp)),
      path: '/',
      domain: process.env.COOKIE_DOMAIN || '',
    });
  };

  const deleteUser = (errorCode) => {
    getAccessToken().then((token) => {
      return axios
        .post(`${process.env.WEB_API_BASE_URL}/v1/auth/accounts/external/${user.id}`, {
          token: token,
        })
        .then((d) => {
          console.log('User deleted');
          document.dispatchEvent(new CustomEvent('auth-invalid-email', { detail: errorCode }))
        })
        .catch((e) => console.error(e));
    });
  };

  const initDirectoryLogin = async () => {
    try {
      document.dispatchEvent(new CustomEvent('app-loader-status', {detail: true}))
      getAccessToken()
        .then((privyToken) => {
          return axios.post(`${process.env.WEB_API_BASE_URL}/v1/auth/token`, {
            exchangeRequestToken: privyToken,
            exchangeRequestId: localStorage.getItem('stateUid'),
            grantType: 'token_exchange',
          });
        })
        .then((result) => {
          saveTokensAndUserInfo(result.data, user);
          loginInUser(result.data);
        })
        .catch((e) => {
          if (user?.email?.address && e?.response?.status === 403) {
            if (user?.email?.address && user?.linkedAccounts.length > 1) {
              unlinkEmail(user?.email?.address)
              .then(d => {
                deleteUser('')
              })
              .catch(e => "");
             
            }
            setLinkAccountKey('');
            logout();
            document.dispatchEvent(new CustomEvent('auth-invalid-email'));
          } else {
            document.dispatchEvent(new CustomEvent('auth-invalid-email', { detail: 'unexpected_error' }))
            setLinkAccountKey('');
            logout();
          }
        }).finally(() => {
          document.dispatchEvent(new CustomEvent('app-loader-status', {detail: false}))
        })
    } catch (error) {
      document.dispatchEvent(new CustomEvent('app-loader-status', {detail: false}))
      document.dispatchEvent(new CustomEvent('auth-invalid-email', { detail: 'unexpected_error' }))
      setLinkAccountKey('');
      logout();
    }
  };

  useEffect(() => {
    function handlePrivyLoginSuccess(e) {
      const info = e.detail;
      // If email is not linked, link email mandatorily
      if (!info?.user?.email?.address) {
        setLinkAccountKey('email');
        return;
      }
      const stateUid = localStorage.getItem('stateUid');
      if(stateUid) {
        // If linked login user
        initDirectoryLogin();
      }
    
    }

    function handlePrivyLinkSuccess(e) {
      const { linkMethod, linkedAccount } = e.detail;
      const authLinkedAccounts = getLinkedAccounts(e.detail.user);
      if (linkMethod === 'email') {
        // Initiate Directory Login to validate email and login user
        initDirectoryLogin();
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
      console.log(e, 'Privy login error');
    }

    function handlePrivyLinkError(e) {
      const userInfo = Cookies.get('userInfo');
      const accessToken = Cookies.get('accessToken');
      const refreshToken = Cookies.get('refreshToken');
      if (!userInfo && !accessToken && !refreshToken) {
        logout();
        setLinkAccountKey('');
        if (e?.detail?.error === 'linked_to_another_user' || e?.detail?.error === "exited_link_flow" || e?.detail?.error === 'invalid_credentials') {
          deleteUser(e?.detail?.error);
          //document.dispatchEvent(new CustomEvent('auth-invalid-email', { detail: e?.detail?.error }))
        }
        //document.dispatchEvent(new CustomEvent('auth-invalid-email', { detail: e?.detail?.error }));

        //setLinkAccountKey('');
      }
    }
    function initPrivyLogin() {
      const stateUid = localStorage.getItem('stateUid')
      if(stateUid) {
        login();
      }
   
    }
    function addAccountToPrivy(e) {
      setLinkAccountKey(e.detail);
    }
    function handlePrivyLogout() {
      Cookies.remove('authLinkedAccounts');
      logout();
    }

    function handlePrivyLogoutSuccess() {
      console.log('privy Logout success');
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
          .hide-on-mobile {
            display: none !important;
          }
        `}
      </style>
    </>
  );
}

export default PrivyModals;
