
import { useEffect, useState } from "react"
import Cookies from 'js-cookie';
import { resendEmailOtp, sendEmailOtp, verifyEmailOtp } from "../../services/auth.service";
import { LoadingIndicator } from "../shared/loading-indicator/loading-indicator";
import EmailSubmissionForm from "./email-submission-form";
import OtpSubmissionForm from "./otp-submission-form";
import { calculateExpiry, decodeToken } from "../../utils/services/auth";
import ErrorBox from "./error-box";
import { toast } from "react-toastify";
import { ReactComponent as SuccessIcon } from '../../public/assets/images/icons/success.svg';
import { APP_ANALYTICS_EVENTS, EMAIL_OTP_CONSTANTS, PAGE_ROUTES } from "../../constants";
import useAppAnalytics from "../../hooks/shared/use-app-analytics";
function EmailOtpVerificationModal() {
    // States
    const [showDialog, setDialogStatus] = useState(false);
    const [verificationStep, setVerificationStep] = useState(1)
    const [isLoaderActive, setLoaderStatus] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [resendInSeconds, setResendInSeconds] = useState(30);
    const analytics = useAppAnalytics()


    const setNewTokensAndUserInfo = (allData) => {
        const { refreshToken, accessToken, userInfo } = allData;
        if (refreshToken && accessToken) {
            const accessTokenExpiry = decodeToken(accessToken);
            const refreshTokenExpiry = decodeToken(refreshToken);
            Cookies.set('authToken', JSON.stringify(accessToken), { expires: calculateExpiry(new Date(accessTokenExpiry.exp)) })
            Cookies.set('refreshToken', JSON.stringify(refreshToken), { expires: calculateExpiry(new Date(refreshTokenExpiry.exp)) })
            Cookies.set('userInfo', JSON.stringify(userInfo), { expires: calculateExpiry(new Date(accessTokenExpiry.exp)) })
        }
    }


    const onOtpVerify = async (otp) => {
        try {
            const authToken = Cookies.get('authToken');
            const otpToken = Cookies.get('uniqueEmailVerifyToken');
            const idToken = Cookies.get('idToken');
            if (!authToken || !otpToken || !idToken) {
                goToError('Invalid attempt. Please login and try again');
                return;
            }
            setErrorMessage('')
            const otpPayload = { otp: otp.join(''), otpToken, idToken}
            const header = { headers: {Authorization: `Bearer ${authToken}`}}
            setLoaderStatus(true)
            analytics.captureEvent(APP_ANALYTICS_EVENTS.USER_VERIFICATION_VERIFY_OTP, {})
            const data = await verifyEmailOtp(otpPayload, header)
            setLoaderStatus(false)
            if (data?.userInfo) {
                setNewTokensAndUserInfo(data);
                clearAllOtpSessionVaribles()
                analytics.captureEvent(APP_ANALYTICS_EVENTS.USER_VERIFICATION_SUCCESS, {})
                setDialogStatus(false);
                localStorage.removeItem('otp-verification-email');
                localStorage.setItem('otp-verify', 'success')
                if (data?.userInfo?.isFirstTimeLogin) {
                    window.location.href = PAGE_ROUTES.SETTINGS;
                } else {
                  window.location.reload();
                }
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
        const email = localStorage.getItem('otp-verification-email');
        const authToken = Cookies.get('authToken');
        if (!authToken || !email || !otpToken) {
            goToError('Invalid attempt. Please login and try again');
            return;
        }

        try {
            setLoaderStatus(true)
            const otpPayload = { email, otpToken }
            const header = { headers: {Authorization: `Bearer ${authToken}`}}

            analytics.captureEvent(APP_ANALYTICS_EVENTS.USER_VERIFICATION_RESEND_OTP, {})
            const d = await resendEmailOtp(otpPayload, header);
            setLoaderStatus(false)

            // Reset resend timer and set unique token for verification
            const uniqueEmailVerifyToken = d.token;
            Cookies.set('uniqueEmailVerifyToken', uniqueEmailVerifyToken, { expires: new Date(new Date().getTime() + 20 * 60 * 1000) })
            localStorage.setItem('resend-expiry', `${new Date(d.resendIn).getTime()}`)

            //setResendTimer()
            setResendInSeconds(30)

        } catch (e) {
            setLoaderStatus(false)
            handleServerErrors(e?.response?.status, e?.response?.data?.message)
        }

    }



    const onEmailSubmitted = async (email) => {
        try {

            // Validation
            const authToken = Cookies.get('authToken');
            if (!authToken) {
                goToError('Invalid attempt. Please login and try again');
                return;
            }

            // Initiate API
            setErrorMessage('')
            setLoaderStatus(true)
            const otpPayload = { email }
            const header = {headers: {Authorization: `Bearer ${authToken}`}}
            analytics.captureEvent(APP_ANALYTICS_EVENTS.USER_VERIFICATION_SEND_OTP, {email})
            const d = await sendEmailOtp(otpPayload, header);

            // Handle Success
            setLoaderStatus(false)
            const uniqueEmailVerifyToken = d.token;
            Cookies.set('uniqueEmailVerifyToken', uniqueEmailVerifyToken, { expires: new Date(new Date().getTime() + 20 * 60 * 1000) })
            localStorage.setItem('otp-verification-email', email);
            localStorage.setItem('otp-verification-step', '2');
            localStorage.setItem('resend-expiry', `${new Date(d.resendIn).getTime()}`)
            setVerificationStep(2);
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
            } else if(messageCode === 'ACCOUNT_ALREADY_LINKED') {
                goToError("Account is already linked to another email.")
            } else if(messageCode) {
                goToError(messageCode)
            } else {
                goToError("Invalid Request. Please try again or contact support")
            }
        } else if (statusCode === 400) {
            if(messageCode === "CODE_EXPIRED") {
                setErrorMessage("OTP expired. Please request for new OTP and try again")
            }
             else if(messageCode) {
                setErrorMessage(messageCode)
            } else {
                setErrorMessage("Invalid Request. Please try again or contact support")
            }
        } else {
            setErrorMessage("Unexpected error. please try again or contact support")
        }
    }

    const onCloseDialog = () => {
        clearAllAuthCookies()
        clearAllOtpSessionVaribles()
        setDialogStatus(false)
    }

    const goToError = (errorMessage) => {
        clearAllAuthCookies()
        clearAllOtpSessionVaribles()
        setErrorMessage(errorMessage);
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
        Cookies.remove('clientToken')
        Cookies.remove('uniqueEmailVerifyToken')
        Cookies.remove('show-email-verification-box')
        localStorage.removeItem('resend-expiry');
        localStorage.removeItem('otp-verification-step');
    }

    const clearAllAuthCookies = () => {
        Cookies.remove('idToken')
        Cookies.remove('authToken')
        Cookies.remove('refreshToken')
        Cookies.remove('userInfo')
    }

    useEffect(() => {
        const verifyBox = Cookies.get('show-email-verification-box');
        const otpVerify = localStorage.getItem('otp-verify')
        if (verifyBox) {
            if (localStorage.getItem('otp-verification-step') === '2') {
                setVerificationStep(2)
                //setResendTimer()
                setResendInSeconds(30)
            }
            Cookies.remove('show-email-verification-box')
            analytics.captureEvent(APP_ANALYTICS_EVENTS.USER_VERIFICATION_INIT, {})
            setDialogStatus(true)
        } else {
            clearAllOtpSessionVaribles();
            const userInfo = Cookies.get('userInfo');
            if(!userInfo) {
                clearAllAuthCookies();
            }
        }

        if (otpVerify) {
            toast.success("Your account has been verified", {
                icon: <SuccessIcon />
            });
            localStorage.removeItem('otp-verify')
        }
    }, [])

    useEffect(() => {
        let countdown;
        if (resendInSeconds > 0) {
            countdown = setInterval(() => {
                setResendInSeconds((prevTimer) => prevTimer - 1);
            }, 1000);
        }
        return () => clearInterval(countdown);
    }, [resendInSeconds]);

    return <>

        {showDialog && <div className="ev">
            <div className="ev__cn">
                <div className="ev__en__box">
                    {verificationStep === 1 && <EmailSubmissionForm title="Verify Email" desc="Please enter the membership email you used to create your directory profile. Don't remember? Contact spaceport@protocol.ai" validationError={errorMessage} onSendOtp={onEmailSubmitted} onClose={onCloseDialog} />}
                    {verificationStep === 2 && <OtpSubmissionForm resendInSeconds={resendInSeconds} title="Enter Code" desc={`Please enter the code sent to ${localStorage.getItem('otp-verification-email')}`} validationError={errorMessage} onResendOtp={onResendOtp} onVerifyOtp={onOtpVerify} onClose={onCloseDialog} />}
                    {verificationStep === 3 && <ErrorBox onClose={onCloseDialog} desc={errorMessage} />}
                    {isLoaderActive && <div className="ev__loader"><LoadingIndicator /></div>}
                </div>
            </div>
        </div>}

        <style jsx>
            {
                `
                .ev {position: fixed; top:0; z-index: 50; right:0; left:0; width: 100vw; height: 100vh; background: rgb(0,0,0,0.8);}
                .ev__cn {width: 100%; height: 100%; display: flex; position: relative; align-items: center; justify-content: center;}
                .ev__loader {position: absolute; background: rgb(255,255,255, 0.7); display: flex; align-items: center; justify-content: center; z-index:52; width: 100%; height: 100%; top:0; right:0; left:0;}
                .ev__en__box {width:fit-content; height:fit-content; position: relative;}
                .ev__en__box__error {background: white; z-index: 51; position: relative; width: 650px; border-radius: 8px; padding: 24px 32px; min-height: 150px; }
                `
            }
        </style>
    </>
}

export default EmailOtpVerificationModal