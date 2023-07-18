import { useEffect, useRef, useState } from "react";

function OtpSubmissionForm(props) {
  //Props Variables
  const onClose = props.onClose
  const onVerifyOtp = props.onVerifyOtp
  const onResendOtp = props.onResendOtp
  const resendInSeconds = props.resendInSeconds
  const validationError = props.validationError;
  const title = props.title || '';
  const desc = props.desc || '';
  const showResend = resendInSeconds > 0 ? false : true

  // State variables
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef([]);
  const [errorMessage, setErrorMessage] = useState('');

  const onOtpSubmit = async (e) => {
    e.preventDefault();
    if (isOtpValid()) {
      if (onVerifyOtp) {
       await onVerifyOtp(otp)
      }
    } else {
      setErrorMessage('Please enter valid 6 digits OTP');
    }
  }


  const onCloseIconClicked = () => {
    if (onClose) {
      onClose()
    }
  }

  const handleInputChange = (index, value) => {
    if (!isNaN(value)) {
      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);
      setErrorMessage('');
      if (value !== '' && index < 5) {
        inputRefs.current[index + 1].focus();
      }
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (index === 0 && otp[index] === '') {
        return; // Prevent clearing the first OTP box
      }

      const newOtp = [...otp];
      newOtp[index] = '';
      setOtp(newOtp);
      setErrorMessage('');

      if (index > 0 && otp[index] === '') {
        inputRefs.current[index - 1].focus();
      }
    } else if (e.key === 'ArrowRight' && otp[index] !== '') {
      if (index < 5) {
        inputRefs.current[index + 1].focus();
        inputRefs.current[index + 1].setSelectionRange(0, 0);
      }
    } else if (e.key === 'ArrowLeft' && otp[index] !== '') {
      if (index > 0) {
        inputRefs.current[index - 1].focus();
        inputRefs.current[index - 1].setSelectionRange(0, 0);
      }
    }
  };

  const handlePaste = (e) => {
    const pastedText = e.clipboardData.getData('text/plain').trim();
    if (/^[0-9]+$/.test(pastedText) && pastedText.length === 6) {
      const newOtp = pastedText.split('');
      setOtp(newOtp);
      setErrorMessage('');
    } else {
      setErrorMessage('Please enter valid 6 digits OTP');
    }
  };

  const isOtpValid = () => {
    return otp.join('').length === 6;
  };

  const handleResendClick = async (e) => {
    e.preventDefault()
    // Set timer to 60 seconds for example, adjust as needed
    if (onResendOtp) {
      setErrorMessage('')
      setOtp(['', '', '', '', '', ''])
      await onResendOtp()
    }
  };

  const formatTime = (seconds) => {
    if (seconds > 0) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;

      const formattedMinutes = String(minutes).padStart(2, '0');
      const formattedSeconds = String(remainingSeconds).padStart(2, '0');

      return `${formattedMinutes}:${formattedSeconds}`;
    }

    return `00:00`;

  };



  useEffect(() => {
    if (validationError) {
      setErrorMessage(validationError)
    }
  }, [validationError])


  return <>
    <div className="evo">
      {/*** Close Icon ***/}
      <div className="evo__close">
        <img className="evo__close__img" onClick={onCloseIconClicked} alt="close" src="/assets/images/icons/closeIcon.svg" />
      </div>

      {/*** Header ***/}
      <div className="evo__header">
        <h3 className="evo__header__title">{title}</h3>
        <div className="evo__header__desc"><p className="evo__header__desc__text">{desc}</p></div>
      </div>

      <form onSubmit={onOtpSubmit} className="evo__body">
        {/*** OTP ***/}
        <div className="evo__body__otp">
          {otp.map((digit, index) => (
            <input
              key={index}
              className="evo__body__otp__input"
              type="text"
              value={digit}
              ref={(ref) => (inputRefs.current[index] = ref)}
              onChange={(e) => handleInputChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={(e) => handlePaste(e)}
              maxLength={1}
              autoFocus={index === 0}
            />
          ))}

        </div>

        {/*** Error message ***/}
        {errorMessage && <div className="evo__body__error">
          <p>{errorMessage}</p>
        </div>}

        {/*** Action buttons ***/}
        <div className="evo__body__submit">
          {showResend && <p onClick={handleResendClick} className="evo__body__submit__resend">Resend Code</p>}
          {!showResend && <div className="evo__body__submit__timer">{`Resend passcode in ${formatTime(resendInSeconds)}`}</div>}
          <button onClick={onOtpSubmit} className="evo__body__submit__btn">Verify</button>
        </div>
      </form>


    </div>
    <style jsx>
      {
        `
            .evo {background: white; z-index: 51; position: relative; width: 650px; border-radius: 8px; padding: 24px 32px; min-height: 150px; }
            .evo__close {background: #475569; cursor: pointer; height: 26px; width: 26px; align-items: center; justify-content: center; position: absolute; right: -13px; top: -13px; border-radius: 50%; display: flex;  border: 1px solid rgba(255, 255, 255, 0.5);}
            .evo__header__title {font-size: 24px; font-weight: 700; color: #0F172A; line-height: 32px; margin-bottom: 10px;}
            .evo__header__desc {display: flex; align-items: center;}
            .evo__header__desc__text {font-size: 14px; color: #0F172A; line-height: 20px; }
            .evo__header__desc__img {cursor: pointer; margin-left: 6px; height: 16px; width: 16px;}
            .evo__body {padding: 10px 0;}
            .evo__body__error {color: #DD2C5A; margin-top: 16px; font-size: 14px; font-weight: 500; margin-top: 8px;}
            .evo__body__otp {display: flex; justify-content: space-between; width: 100%;}
            .evo__body__otp__input {padding: 8px 12px; padding: '10px';boxSizing: 'border-box'; text-align: center;color: #0F172A; font-size: 32px; font-weight: 500; width: 74px; height: 40px;border-bottom: 1px solid #CBD5E1;}
            .evo__body__submit{display: flex; margin-top: 16px; align-items: center; justify-content: flex-end; width: 100%;}
            .evo__body__submit__resend {border: 1px solid #156FF7; cursor: pointer; color: #156FF7; margin-right: 8px; font-size: 15px; font-weight: 600; padding: 8px 24px; box-shadow: 0px 1px 1px rgba(7, 8, 8, 0.16), inset 0px 1px 0px rgba(255, 255, 255, 0.16);border-radius: 100px;}
            .evo__body__submit__timer {color: #64748B; padding: 0 8px; font-size: 14px; font-weight: 400; line-height: 20px; margin-right: 8px;}
            .evo__body__submit__btn {padding: 8px 24px; font-weight: 600; color: white; height: 40px;background: linear-gradient(71.47deg, #427DFF 8.43%, #44D5BB 87.45%);box-shadow: 0px 1px 1px rgba(7, 8, 8, 0.16), inset 0px 1px 0px rgba(255, 255, 255, 0.16); border-radius: 100px;}
            .evo__body__otp__input:focus {outline: none;}
            input::-webkit-outer-spin-button,
            input::-webkit-inner-spin-button {
              -webkit-appearance: none;
              margin: 0;
            }
            input[type=number] {
              -moz-appearance: textfield;
              /* Firefox */
            }
            `
      }
    </style>
  </>
}

export default OtpSubmissionForm