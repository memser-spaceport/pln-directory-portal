import { usePostHog } from 'posthog-js/react'
import Cookies from 'js-cookie'
function useAuthAnalytics() {
    const events = {
        AUTH_LOGIN_BTN_CLICKED: 'AUTH_LOGIN_BTN_CLICKED',
        AUTH_PROCEED_TO_LOGIN_CLICKED: 'AUTH_PROCEED_TO_LOGIN_CLICKED',
        AUTH_INFO_POPUP_CLOSED: 'AUTH_INFO_POPUP_CLOSED',
        AUTH_PRIVY_LOGIN_SUCCESS: 'AUTH_PRIVY_LOGIN_SUCCESS',
        AUTH_DIRECTORY_LOGIN_INIT: 'AUTH_DIRECTORY_LOGIN_INIT',
        AUTH_DIRECTORY_LOGIN_SUCCESS: 'AUTH_DIRECTORY_LOGIN_SUCCESS',
        AUTH_DIRECTORY_LOGIN_FAILURE: 'AUTH_DIRECTORY_LOGIN_FAILURE',
        AUTH_PRIVY_LINK_SUCCESS: 'AUTH_PRIVY_LINK_SUCCESS',
        AUTH_PRIVY_UNLINK_EMAIL: 'AUTH_PRIVY_UNLINK_EMAIL',
        AUTH_PRIVY_DELETE_USER: 'AUTH_PRIVY_DELETE_USER',
        AUTH_PRIVY_LINK_ERROR: 'AUTH_PRIVY_LINK_ERROR',
        AUTH_SETTINGS_PRIVY_ACCOUNT_LINK: 'AUTH_SETTINGS_PRIVY_ACCOUNT_LINK'

    }
    const postHogProps = usePostHog();
    const getUserInfo = () => {
        try {
            let userInfo;
            if (typeof window !== 'undefined') {
                const rawUserInfo = Cookies.get('userInfo');
                if(rawUserInfo) {
                    userInfo = JSON.parse(rawUserInfo);
                }
            }
            return userInfo;
        } catch (e) {
            console.error(e)
            return null;
        }
    }
    const captureEvent = (eventName, eventParams = {}) => {
        try {

            if (postHogProps?.capture) {
                const userInfo = getUserInfo()
                const userName = userInfo?.name;
                const userUid = userInfo?.uid;
                const userEmail = userInfo?.email;
                const distinct_id = userInfo?.uid
                const allParams = {...eventParams, ...(userName && userUid && userEmail && distinct_id && {userName, userUid, userEmail, distinct_id})  }
                postHogProps.capture(eventName, { ...allParams })
            }
        } catch (e) {
            console.error(e)
        }
    }

    const onLoginBtnClicked = () => {
        captureEvent(events.AUTH_LOGIN_BTN_CLICKED)
    }

    const onProceedToLogin = () => {
        captureEvent(events.AUTH_PROCEED_TO_LOGIN_CLICKED)
    }

    const onAuthInfoClosed = () => {
        captureEvent(events.AUTH_INFO_POPUP_CLOSED)
    }

    const onPrivyLoginSuccess = (privyUser) => {
        captureEvent(events.AUTH_PRIVY_LOGIN_SUCCESS, {...privyUser})
    }

    const onDirectoryLoginInit = (privyUser) => {
        captureEvent(events.AUTH_DIRECTORY_LOGIN_INIT, {...privyUser})
    }

    const onDirectoryLoginSuccess = () => {
        captureEvent(events.AUTH_DIRECTORY_LOGIN_SUCCESS)
    }

    const onDirectoryLoginFailure = (privyUser) => {
        captureEvent(events.AUTH_DIRECTORY_LOGIN_FAILURE, {...privyUser})
    }

    const onPrivyUnlinkEmail = (privyUser) => {
        captureEvent(events.AUTH_PRIVY_UNLINK_EMAIL, {...privyUser})
    }

    const onPrivyUserDelete = (privyUser) => {
        captureEvent(events.AUTH_PRIVY_DELETE_USER,  {...privyUser})
    }
    
    const onPrivyLinkSuccess = (privyUser) => {
        captureEvent(events.AUTH_PRIVY_LINK_SUCCESS, {...privyUser})
    }

    const onAccountLinkError = (privyUser) => {
        captureEvent(events.AUTH_PRIVY_LINK_ERROR, {...privyUser})
    }

    const onPrivyAccountLink = (privyUser) => {
        captureEvent(events.AUTH_SETTINGS_PRIVY_ACCOUNT_LINK, {...privyUser})
    }

    return { onLoginBtnClicked, onProceedToLogin, onAuthInfoClosed, onPrivyLinkSuccess, onPrivyUnlinkEmail, onPrivyUserDelete, onPrivyLoginSuccess, onDirectoryLoginInit, onDirectoryLoginSuccess, onDirectoryLoginFailure, onAccountLinkError, onPrivyAccountLink }
}

export default useAuthAnalytics;