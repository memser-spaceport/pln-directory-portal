import { useLinkAccount, useLogin, usePrivy } from '@privy-io/react-auth';

function usePrivyWrapper() {
  const { authenticated, logout, unlinkEmail, updateEmail, ready, linkGoogle, linkWallet, user, getAccessToken } = usePrivy();
  const PRIVY_CUSTOM_EVENTS = {
    AUTH_LOGIN_SUCCESS: 'AUTH_LOGIN_SUCCESS',
    AUTH_LINK_ACCOUNT_SUCCESS: 'AUTH_LINK_ACCOUNT_SUCCESS',
    AUTH_LOGIN_ERROR: 'AUTH_LOGIN_ERROR',
    AUTH_LINK_ERROR: 'AUTH_LINK_ERROR',
  };
  /*****  SETUP FOR PRIVY LOGIN POPUP *******/
  const { login } = useLogin({
    onComplete: (user) => {
      document.dispatchEvent(new CustomEvent(PRIVY_CUSTOM_EVENTS.AUTH_LOGIN_SUCCESS, { detail: { user } }));
    },
    onError: (error) => {
      document.dispatchEvent(new CustomEvent(PRIVY_CUSTOM_EVENTS.AUTH_LOGIN_ERROR, { detail: { error } }));
    },
  });

  /*****  SETUP FOR PRIVY LINK ACCOUNT POPUP *******/
  const { linkEmail, linkGithub } = useLinkAccount({
    onSuccess: (user, linkMethod, linkedAccount) => {
      document.dispatchEvent(
        new CustomEvent(PRIVY_CUSTOM_EVENTS.AUTH_LINK_ACCOUNT_SUCCESS, { detail: { user, linkMethod, linkedAccount } })
      );
    },
    onError: (error) => {
      document.dispatchEvent(new CustomEvent(PRIVY_CUSTOM_EVENTS.AUTH_LINK_ERROR, { detail: { error } }));
    },
  });

  return {
    login,
    linkEmail,
    unlinkEmail,
    linkGithub,
    linkGoogle,
    linkWallet,
    logout,
    updateEmail,
    getAccessToken,
    user,
    authenticated,
    ready,
    PRIVY_CUSTOM_EVENTS,
  };
}

export default usePrivyWrapper;
