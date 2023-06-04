
import { useEffect, useState } from "react"
import Cookies from 'js-cookie';
import { sendEmailVerificationOtp, sendOtpForEmailChange, validateEmailOtp, verifyOtpForChangeEmail } from "../../services/auth.service";
import { LoadingIndicator } from "../shared/loading-indicator/loading-indicator";
import EmailSubmissionForm from "./email-submission-form";
import OtpSubmissionForm from "./otp-submission-form";
import { calculateExpiry, decodeToken } from "../../utils/services/auth";
import ErrorBox from "./error-box";
import { EMAIL_OTP_CONSTANTS } from "../../constants";
function ChangeEmailModal(props) {
    // States
    const [verificationStep, setVerificationStep] = useState(1)
    const [isLoaderActive, setLoaderStatus] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [resendInSeconds, setResendInSeconds] = useState(30);

    // Variables
    const onClose = props.onClose
    const textConstants = EMAIL_OTP_CONSTANTS['CHANGE_EMAIL'];

    const setNewTokensAndUserInfo = (allTokens, userInfo) => {
        const { refresh_token, access_token, } = allTokens;
        if (refresh_token && access_token) {
            const accessTokenExpiry = decodeToken(access_token);
            const refreshTokenExpiry = decodeToken(refresh_token);
            Cookies.set('authToken', JSON.stringify(access_token), { expires: calculateExpiry(new Date(accessTokenExpiry.exp)) })
            Cookies.set('refreshToken', JSON.stringify(refresh_token), { expires: calculateExpiry(new Date(refreshTokenExpiry.exp)) })
            Cookies.set('userInfo', JSON.stringify(userInfo), { expires: calculateExpiry(new Date(accessTokenExpiry.exp)) })
        }
    }


    const onOtpVerify = async (otp) => {
        try {
            setErrorMessage('')
            const otpPayload = {
                otp: otp.join(''),
                otpToken: Cookies.get('uniqueEmailVerifyToken'),
                clientToken: Cookies.get('clientAccessToken'),
                accessToken: Cookies.get('idToken'),
                emailId: localStorage.getItem('otp-verification-email')
            }
            const accessToken = Cookies.get('authToken');
            setLoaderStatus(true)
            const headers = {Authorization: `Bearer ${JSON.parse(accessToken)}`}
            const data = await verifyOtpForChangeEmail(otpPayload, headers)
            setLoaderStatus(false)
            if (data?.userInfo) {
                setNewTokensAndUserInfo(data?.newTokens, data?.userInfo)
                clearAllOtpSessionVaribles()
                onClose(false);
                localStorage.setItem('otp-verify', 'success')
                window.location.reload()
            } else if (!data?.valid) {
                setErrorMessage('Invalid OTP. Please enter valid otp sent to your email or try resending OTP.')
            }
        } catch (e) {
            setLoaderStatus(false)
            handleServerErrors(e?.response?.status, e?.response?.data?.message)
        }
    }



    const onResendOtp = async () => {
        setErrorMessage('')
        const newEmail = localStorage.getItem('otp-verification-email');
        const accessToken = Cookies.get('authToken');
        const clientToken = Cookies.get('clientAccessToken');
        if (!clientToken || !newEmail) {
            goToError('Invalid attempt. Please login and try again');
            return;
        }

        try {
            setLoaderStatus(true)
            const otpPayload = {newEmail,clientToken}
            const headers = {Authorization: `Bearer ${JSON.parse(accessToken)}`}
            const d = await sendOtpForEmailChange(otpPayload, headers);
            setLoaderStatus(false)

            // Reset resend timer and set unique token for verification
            const uniqueEmailVerifyToken = d.token;
            Cookies.set('uniqueEmailVerifyToken', uniqueEmailVerifyToken, { expires: new Date(new Date().getTime() + 60 * 60 * 1000) })
            localStorage.setItem('resend-expiry', `${new Date(d.resendIn).getTime()}`)
            setResendTimer()
        } catch (e) {
            setLoaderStatus(false)
            handleServerErrors(e?.response?.status, e?.response?.data?.message)
        }

    }



    const onEmailSubmitted = async (email) => {
        try {
            const clientToken = Cookies.get('clientAccessToken');
            const accessToken = Cookies.get('authToken');
            if (!clientToken) {
                goToError('Invalid attempt. Please login and try again');
                return;
            }
            const otpPayload = { newEmail: email, clientToken }
            const headers = {Authorization: `Bearer ${JSON.parse(accessToken)}`}
            setErrorMessage('')
            setLoaderStatus(true)
            const d = await sendOtpForEmailChange(otpPayload, headers);
            setLoaderStatus(false)
            const uniqueEmailVerifyToken = d.token;
            Cookies.set('uniqueEmailVerifyToken', uniqueEmailVerifyToken, { expires: new Date(new Date().getTime() + 60 * 60 * 1000) })
            localStorage.setItem('otp-verification-email', email);
            localStorage.setItem('change-email-step', '2');
            localStorage.setItem('resend-expiry', `${new Date(d.resendIn).getTime()}`)
            setVerificationStep(2);
            setResendTimer();

        } catch (error) {
            console.error(error)
            setLoaderStatus(false)
            handleServerErrors(error?.response?.status, error?.response?.data?.message)
        }
    }

    const handleServerErrors = (statusCode, messageCode) => {
        if(statusCode === 400 && messageCode === 'Code expired') {
            setErrorMessage('Code Expired. Please try resending code and enter again')
        } else if (statusCode === 400 && messageCode === 'Max attempts reached') {
            goToError('You have Exceeded maximum otp attempts. Please login again to reset otp attempts')
        } else if (statusCode === 400 && messageCode === 'Email id doesnt exist') {
            setErrorMessage("The entered email doesn't match an email in the directory records. Please try again or contact support ")
        } else if (statusCode === 400 && messageCode === 'client token is valid') {
            setErrorMessage("Request is invalid. Please try logging in again or contact our support for futher assistance")
        } else if (statusCode && messageCode) {
            setErrorMessage(messageCode)
        } else {
            goToError('Unexpected error happened. Please try logging in again')
        }
    }

    const onCloseDialog = () => {
        clearAllOtpSessionVaribles()

        if(onClose) {
            onClose()
        }
    }

    const goToError = (errorMessage) => {
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
        Cookies.remove('clientAccessToken')
        Cookies.remove('uniqueEmailVerifyToken')
        localStorage.removeItem('resend-expiry');
        localStorage.removeItem('otp-verification-email');
        localStorage.removeItem('change-email-step');
    }


    useEffect(() => {
       // clearAllOtpSessionVaribles()
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
                .ev {position: fixed; top:0; z-index: 50; right:0; left:0; width: 100vw; height: 100vh; background: rgb(0,0,0,0.5);}
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