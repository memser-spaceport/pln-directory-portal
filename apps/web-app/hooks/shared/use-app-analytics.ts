import { usePostHog } from 'posthog-js/react'
import Cookies from 'js-cookie'
import { cookiePrefix } from "../../utils/common.utils";

function useAppAnalytics() {
    const postHogProps = usePostHog();
    const getUserInfo = () => {
        try {
            let userInfo;
            if (typeof window !== 'undefined') {
                const rawUserInfo = Cookies.get(`${cookiePrefix()}userInfo`);
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

    return { captureEvent }
}

export default useAppAnalytics;