
import { useEffect, useState } from "react"
import Cookies from 'js-cookie';
import { resendEmailOtp } from "../../services/auth.service";
import { LoadingIndicator } from "../shared/loading-indicator/loading-indicator";
import EmailSubmissionForm from "./email-submission-form";
import OtpSubmissionForm from "./otp-submission-form";
import { calculateExpiry, decodeToken } from "../../utils/services/auth";
import ErrorBox from "./error-box";
import { APP_ANALYTICS_EVENTS, EMAIL_OTP_CONSTANTS } from "../../constants";
import useAppAnalytics from "../../hooks/shared/use-app-analytics";
import { sendOtpToChangeEmail, verifyAndProcessEmailChange } from "../../services/member.service";
function ChangeEmailModal(props) {
    // States
    const [verificationStep, setVerificationStep] = useState(1)
    const [isLoaderActive, setLoaderStatus] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [resendInSeconds, setResendInSeconds] = useState(30);
    const [memberUid, setMemberUid] = useState(null)
    const analytics = useAppAnalytics()

    // Variables
    const onClose = props.onClose
    const textConstants = EMAIL_OTP_CONSTANTS['CHANGE_EMAIL'];

    const setNewTokensAndUserInfo = (allData) => {
        const { refreshToken, accessToken, userInfo} = allData;
        if (refreshToken && accessToken) {
            const accessTokenExpiry = decodeToken(accessToken);
            const refreshTokenExpiry = decodeToken(refreshToken);
            Cookies.set('authToken', JSON.stringify(accessToken), { 
                expires: calculateExpiry(new Date(accessTokenExpiry.exp)),
                domain: process.env.COOKIE_DOMAIN || ''
            });
            Cookies.set('refreshToken', JSON.stringify(refreshToken), {
                expires: calculateExpiry(new Date(refreshTokenExpiry.exp)),
                domain: process.env.COOKIE_DOMAIN || ''
            });
            Cookies.set('userInfo', JSON.stringify(userInfo), { 
                expires: calculateExpiry(new Date(accessTokenExpiry.exp)),
                domain: process.env.COOKIE_DOMAIN || ''
            });
        }
    }


    const onOtpVerify = async (otp) => {
        try {
            setErrorMessage('')
            const otpToken = Cookies.get('uniqueEmailVerifyToken');
            const accessToken = Cookies.get('authToken');

            if (!accessToken) {
                goToError('Invalid attempt. Please login and try again');
                return;
            }

            if(!otpToken) {
                goToError("OTP Session expired. Please login and try again");
                return;
            }
            const otpPayload = {
                otp: otp.join(''),
                otpToken: otpToken,
            }

            setLoaderStatus(true)
            const header = {headers: {Authorization: `Bearer ${JSON.parse(accessToken)}`}}
            analytics.captureEvent(APP_ANALYTICS_EVENTS.SETTINGS_USER_CHANGE_EMAIL_VERIFY_OTP, {})
            const data = await verifyAndProcessEmailChange(otpPayload, memberUid, header)
            setLoaderStatus(false)
            if (data?.userInfo) {
                setNewTokensAndUserInfo(data)
                clearAllOtpSessionVaribles()
                analytics.captureEvent(APP_ANALYTICS_EVENTS.SETTINGS_USER_CHANGE_EMAIL_SUCCESS, {})
                onClose(null);
                Cookies.set('page_params', 'email_changed', { expires: 60, path: '/' });
                window.location.reload()
            } else if (!data?.valid) {
                setResendInSeconds(30);
                setErrorMessage('Invalid OTP. Please enter valid OTP sent to your email or try resending OTP.')
            }
        } catch (e) {
            setLoaderStatus(false)
            handleServerErrors(e?.response?.status, e?.response?.data?.message)
        }
    }



    const onResendOtp = async () => {
        setErrorMessage('')
        const otpToken = Cookies.get('uniqueEmailVerifyToken');
        const accessToken = Cookies.get('authToken');
        if (!accessToken) {
            goToError('Invalid attempt. Please login and try again');
            return;
        }

        if(!otpToken) {
            goToError("Otp Session expired. Please login and try again");
            return;
        }

        try {
            setLoaderStatus(true)
            const otpPayload = {otpToken}
            const header = {headers: {Authorization: `Bearer ${JSON.parse(accessToken)}`}}
            analytics.captureEvent(APP_ANALYTICS_EVENTS.SETTINGS_USER_CHANGE_EMAIL_RESEND_OTP, {})
            const d = await resendEmailOtp(otpPayload, header);
            setLoaderStatus(false)

            // Reset resend timer and set unique token for verification
            const uniqueEmailVerifyToken = d.token;
            Cookies.set('uniqueEmailVerifyToken', uniqueEmailVerifyToken, { expires: new Date(new Date().getTime()  + 20 * 60 * 1000) })
            localStorage.setItem('resend-expiry', `${new Date(d.resendIn).getTime()}`)
           // setResendTimer()
           setResendInSeconds(30)
        } catch (e) {
            setLoaderStatus(false)
            handleServerErrors(e?.response?.status, e?.response?.data?.message)
        }

    }



    const onEmailSubmitted = async (email) => {
        try {
            const accessToken = Cookies.get('authToken');
            const otpPayload = { newEmail: email }
            const header = {headers: {Authorization: `Bearer ${JSON.parse(accessToken)}`}}
            setErrorMessage('')
            setLoaderStatus(true)
            analytics.captureEvent(APP_ANALYTICS_EVENTS.SETTINGS_USER_CHANGE_EMAIL_SEND_OTP, {})
            const d = await sendOtpToChangeEmail(otpPayload, memberUid, header);
            setLoaderStatus(false)
            const uniqueEmailVerifyToken = d.token;
            Cookies.set('uniqueEmailVerifyToken', uniqueEmailVerifyToken, { expires: new Date(new Date().getTime() + 20 * 60 * 1000) })
            localStorage.setItem('otp-verification-email', email);
            localStorage.setItem('resend-expiry', `${new Date(d.resendIn).getTime()}`)
            setVerificationStep(2);
            //setResendTimer();
            setResendInSeconds(30)

        } catch (error) {
            console.error(error)
            setLoaderStatus(false)
            handleServerErrors(error?.response?.status, error?.response?.data?.message)
        }
    }

    const handleServerErrors = (statusCode, messageCode) => {
        if(statusCode === 401 || statusCode === 403) {
            if(messageCode === "MAX_OTP_ATTEMPTS_REACHED") {
                goToError("Maximum OTP attempts exceeded. Please login again and try")
            } else if(messageCode === "MAX_RESEND_ATTEMPTS_REACHED") {
                goToError("Maximum OTP resend attempts exceeded. Please login again and try")
            } else if(messageCode) {
                goToError(messageCode)
            } else {
                goToError("Invalid Request. Please try again or contact support")
            }
        } else if (statusCode === 400) {
            if(messageCode === "CODE_EXPIRED") {
                setErrorMessage("OTP expired. Please request for new OTP and try again")
            } else if(messageCode) {
                setErrorMessage(messageCode)
            } else {
                setErrorMessage("Invalid Request. Please try again or contact support")
            }
        } else {
            setErrorMessage("Unexpected error. please try again or contact support")
        }
    }


    const onCloseDialog = () => {
        clearAllOtpSessionVaribles()

        if(onClose) {
            onClose(verificationStep)
        }
    }

    const clearAllAuthCookies = () => {
        Cookies.remove('idToken')
        Cookies.remove('authToken')
        Cookies.remove('refreshToken')
        Cookies.remove('userInfo')
    }

    const goToError = (errorMessage) => {
        clearAllOtpSessionVaribles()
        setErrorMessage(errorMessage);
        clearAllAuthCookies()
        setVerificationStep(3);
    }

    const setResendTimer = () => {
        if (localStorage.getItem('resend-expiry')) {
            const resendExpiry = localStorage.getItem('resend-expiry');
            const resendRemainingSeconds = Math.round((Number(resendExpiry) - new Date().getTime()) / 1000)
            setResendInSeconds(resendRemainingSeconds);
        }
    }

    const clearAllOtpSessionVaribles = () => {
        Cookies.remove('clientAccessToken')
        Cookies.remove('uniqueEmailVerifyToken')
        localStorage.removeItem('resend-expiry');
        localStorage.removeItem('otp-verification-email');
    }

    useEffect(() => {
        let countdown;
        if (resendInSeconds > 0) {
            countdown = setInterval(() => {
                setResendInSeconds((prevTimer) => prevTimer - 1);
            }, 1000);
        }
        return () => clearInterval(countdown);

    }, [resendInSeconds]);

    useEffect(() => {
        const userInfoFromCookie = Cookies.get('userInfo');
        if (userInfoFromCookie) {
          const parsedUserInfo = JSON.parse(userInfoFromCookie);
          setMemberUid(parsedUserInfo.uid)
        }
    }, [])


    return <>

        <div className="ev">
            <div className="ev__cn">
                <div className="ev__en__box">
                    {verificationStep === 1 && <EmailSubmissionForm title={textConstants.sendEmailTitle} desc={textConstants.sendEmailDesc} validationError={errorMessage} onSendOtp={onEmailSubmitted} onClose={onCloseDialog} />}
                    {verificationStep === 2 && <OtpSubmissionForm resendInSeconds={resendInSeconds} title={textConstants.verifyOtpTitle} desc={`${textConstants.verifyOtpDesc} ${localStorage.getItem('otp-verification-email')}`} validationError={errorMessage} onResendOtp={onResendOtp} onVerifyOtp={onOtpVerify} onClose={onCloseDialog} />}
                    {verificationStep === 3 && <ErrorBox onClose={onCloseDialog} desc={errorMessage} />}
                    {isLoaderActive && <div className="ev__loader"><LoadingIndicator /></div>}
                </div>
            </div>
        </div>

        <style jsx>
            {
                `
                .ev {position: fixed; top:0; z-index: 2000; right:0; left:0; width: 100vw; height: 100vh; background: rgb(0,0,0,0.8);}
                .ev__cn {width: 100%; height: 100%; display: flex; position: relative; align-items: center; justify-content: center;}
                .ev__loader {position: absolute; background: rgb(255,255,255, 0.7); display: flex; align-items: center; justify-content: center; z-index:52; width: 100%; height: 100%; top:0; right:0; left:0;}
                .ev__en__box {width:fit-content; height:fit-content; position: relative;}
                .ev__en__box__error {background: white; z-index: 51; position: relative; width: 650px; border-radius: 8px; padding: 24px 32px; min-height: 150px; }
                `
            }
        </style>
    </>
}

export default ChangeEmailModal