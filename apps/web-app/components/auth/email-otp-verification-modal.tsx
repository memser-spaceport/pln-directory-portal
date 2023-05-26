
import { useEffect, useState } from "react"
import Cookies from 'js-cookie';
import { sendEmailVerificationOtp, validateEmailOtp } from "../../services/auth.service";
import { LoadingIndicator } from "../shared/loading-indicator/loading-indicator";
import EmailSubmissionForm from "./email-submission-form";
import OtpSubmissionForm from "./otp-submission-form";
import { calculateExpiry, decodeToken } from "../../utils/services/auth";
import ErrorBox from "./error-box";
import { toast } from "react-toastify";
import { ReactComponent as SuccessIcon } from '../../public/assets/images/icons/success.svg';
function EmailOtpVerificationModal() {
    const [showDialog, setDialogStatus] = useState(false);
    const [verificationStep, setVerificationStep] = useState(1)
    const [isLoaderActive, setLoaderStatus] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [resendInSeconds, setResendInSeconds] = useState(30);

    const setNewTokens = (allTokens) => {
        const { refresh_token, access_token, } = allTokens;
        if (refresh_token && access_token) {
            const accessTokenExpiry = decodeToken(access_token);
            const refreshTokenExpiry = decodeToken(refresh_token);
            Cookies.set('authToken', JSON.stringify(access_token), { expires: calculateExpiry(new Date(accessTokenExpiry.exp)) })
            Cookies.set('refreshToken', JSON.stringify(refresh_token), { expires: calculateExpiry(new Date(refreshTokenExpiry.exp)) })

        }
    }


    const onOtpVerify = (otp) => {

        // Clear any previous error message
        setErrorMessage('')


        // number of OTP verification attempt check
        const otpVerifyAttempts = localStorage.getItem('otp-attempts');
        const otpVerifyMaxAttempts = localStorage.getItem('otp-max-attempts');
        if (!otpVerifyAttempts) {
            localStorage.setItem('otp-attempts', '1');
        } else if (otpVerifyAttempts && Number(otpVerifyAttempts) >= Number(otpVerifyMaxAttempts)) {
            goToError('You have Exceeded maximum otp attempts. Please login again to reset otp attempts')
            return;
        }

        const otpPayload = {
            otp: otp.join(''),
            otpToken: Cookies.get('uniqueEmailVerifyToken'),
            notificationToken: Cookies.get('notificationToken'),
            accessToken: Cookies.get('idToken'),
            emailId: localStorage.getItem('otp-verification-email')
        }

        setLoaderStatus(true)
        validateEmailOtp(otpPayload)
            .then(data => {
                if (data?.userInfo) {
                    const accessTokenExpiry = decodeToken(Cookies.get('authToken'));
                    console.log(data)
                    setNewTokens(data?.newTokens)
                    Cookies.set('userInfo', JSON.stringify(data?.userInfo), { expires: calculateExpiry(new Date(accessTokenExpiry.exp)) })
                    Cookies.remove('notificationToken')
                    Cookies.remove('uniqueEmailVerifyToken')
                    localStorage.clear()
                    setDialogStatus(false);
                    localStorage.setItem('otp-verify', 'success')
                    window.location.reload()
                } else if (!data?.valid) {
                    localStorage.setItem('otp-attempts', `${Number(otpVerifyAttempts) + 1}`)
                    setErrorMessage('Invalid OTP. Please enter valid otp sent to your email or try resending OTP.')
                }
            })
            .catch(e => {
                if(e?.response?.status && e?.response?.message) {
                    setErrorMessage(e?.response?.message)
                } else {
                   goToError('Unexpected error happened. Please try logging in again')
                }
            })
            .finally(() => {
                setLoaderStatus(false)
            })

    }

    const sendOtp = async (email) => {
        // Get verification token
        const notificationToken = Cookies.get('notificationToken')

        // Send email in body along with Verification token in header
        const otpPayload = {
            email,
            notificationToken
        }

        return await sendEmailVerificationOtp(otpPayload)
    }



    const onResendOtp = () => {
        setErrorMessage('')
        const userEmail = localStorage.getItem('otp-verification-email');
        const resendTryCount = localStorage.getItem('resend-try-count');
        const resendMaxTryCount = localStorage.getItem('resend-max-attempts');
        const notificationToken = Cookies.get('notificationToken');
        if (!notificationToken) {
            goToError('Invalid attempt. Please login and try again');
            return;
        }
        if (userEmail) {
            if (!resendTryCount) {
                localStorage.setItem('resend-try-count', "1");
            } else if (resendTryCount && resendTryCount >= resendMaxTryCount) {
                goToError('You have Exceeded maximum attempts to resend OTP. Please login again.')
                return;
            }
            setErrorMessage('')
            setLoaderStatus(true)
            sendOtp(userEmail)
                .then(d => {
                    console.log(d);

                    const uniqueEmailVerifyToken = d.token;
                    Cookies.set('uniqueEmailVerifyToken', uniqueEmailVerifyToken, { expires: new Date(new Date().getTime() + 5 * 60 * 1000) })
                    localStorage.setItem('resend-expiry', `${new Date(d.resendIn).getTime()}`)
                    const newCount = Number(resendTryCount) + 1;
                    localStorage.setItem('resend-try-count', `${newCount}`)
                    setResendTimer()
                })
                .catch((e) => {
                    if(e?.response?.status === 400 && e?.response?.message === 'Max attempts reached') {
                        goToError('You have Exceeded maximum attempts to resend OTP. Please login again.')
                    } else if (e?.response.status && e?.response?.message) {
                        setErrorMessage(e?.response?.message)
                    }
                    else {
                        goToError('Unexpected error happened. Please try logging in again')
                    }
                })
                .finally(() => setLoaderStatus(false))
        }
    }

    const onEmailSubmitted = (email) => {
        setErrorMessage('')
        setLoaderStatus(true)
        sendOtp(email)
            .then(d => {
                const maxAttempts = d.maxAttempts;
                const maxResends = d.maxResends;
                const uniqueEmailVerifyToken = d.token;
                Cookies.set('uniqueEmailVerifyToken', uniqueEmailVerifyToken, { expires: new Date(new Date().getTime() + 5 * 60 * 1000) })
                localStorage.setItem('otp-verification-email', email);
                localStorage.setItem('otp-verification-step', '2');
                localStorage.setItem('otp-max-attempts', `${maxAttempts}`);
                localStorage.setItem('resend-max-attempts', `${maxResends}`);
                localStorage.setItem('resend-expiry', `${new Date(d.resendIn).getTime()}`)
                setVerificationStep(2);
                setResendTimer()
            })
            .catch((error) => {
                if (error?.response?.status === 400 && error?.response?.data?.message === 'Email id doesnt exist') {
                    setErrorMessage("The entered email doesn't match an email in the directory records. Please try again or contact support ")
                } else if (error?.response?.status === 400 && error?.response?.data?.message === 'Notification Token missing') {
                    goToError("Request is invalid. Please try logging in again or contact our support for futher assistance")
                }
                else {
                    setErrorMessage('Unexpected error happened. Please try again')
                }
            })
            .finally(() => setLoaderStatus(false))
    }


    const onCloseDialog = () => {
        clearAllSavedCookieItems()
        clearAllSavedSessionItems()
        setDialogStatus(false)
    }

    const goToError = (errorMessage) => {
        clearAllSavedCookieItems()
        clearAllSavedSessionItems()
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

    const clearAllSavedCookieItems = () => {
        Cookies.remove('notificationToken')
        Cookies.remove('uniqueEmailVerifyToken')
        Cookies.remove('idToken')
        Cookies.remove('authToken')
        Cookies.remove('refreshToken')
        Cookies.remove('userInfo')
    }

    const clearAllSavedSessionItems = () => {
        localStorage.removeItem('otp-attempts');
        localStorage.removeItem('resend-try-count');
        localStorage.removeItem('resend-expiry');
        localStorage.removeItem('otp-verification-email');
        localStorage.removeItem('otp-verification-step');
        localStorage.removeItem('otp-max-attempts');
        localStorage.removeItem('resend-max-attempts');
    }

    useEffect(() => {
        const notificationToken = Cookies.get('notificationToken');
        const otpVerify = localStorage.getItem('otp-verify')
        if (notificationToken) {
            if (localStorage.getItem('otp-verification-step') === '2') {
                setVerificationStep(2)
                setResendTimer()
            }
            setDialogStatus(true)
        } else {
            clearAllSavedSessionItems()
        }

        if(otpVerify) {
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
                    {verificationStep === 1 && <EmailSubmissionForm title="Verify Email" desc="Please enter the membership email you used to create your directory profile. Don't remember? Contact support supportmail@protocol.ai" validationError={errorMessage} onSendOtp={onEmailSubmitted} onClose={onCloseDialog} />}
                    {verificationStep === 2 && <OtpSubmissionForm resendInSeconds={resendInSeconds} title="Enter Code" desc={`Please enter the code send to ${localStorage.getItem('otp-verification-email')}`} validationError={errorMessage} onResendOtp={onResendOtp} onVerifyOtp={onOtpVerify} onClose={onCloseDialog} />}
                    {verificationStep === 3 && <ErrorBox onClose={onCloseDialog} desc={errorMessage} />}
                    {isLoaderActive && <div className="ev__loader"><LoadingIndicator /></div>}
                </div>
            </div>
        </div>}

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

export default EmailOtpVerificationModal