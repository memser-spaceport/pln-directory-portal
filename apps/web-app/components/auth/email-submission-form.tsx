import { useEffect, useRef, useState } from "react";

function EmailSubmissionForm(props) {
    // Props variables
    const title = props.title || '';
    const desc= props.desc || '';
    const onSendOtp = props.onSendOtp;
    const onClose = props.onClose;
    const validationError = props.validationError || '';


    // State & ref variables
    const [errorMessage, setErrorMessage] = useState('')
    const inputRef: any = useRef()

    const onInputChange = () => {
        if(errorMessage !== '') {
            setErrorMessage('');
        }
    }

    const onEmailSubmitted = async (e) => {
        e.preventDefault();
        const emailValue = inputRef.current.value.trim();
        const emailRegex = /^(([^<>()[\].,;:\s@"]+(\.[^<>()[\].,;:\s@"]+)*)|(".+"))@(([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})$/;
        if(!emailRegex.test(emailValue)) {
            setErrorMessage('Please enter valid email')
            return
        }
        if(onSendOtp) {
            await onSendOtp(emailValue)
        }
    }

    const onCloseIconClicked = () => {
        if(onClose) {
            onClose()
        }
    }

    useEffect(() => {
        console.log(validationError)
        setErrorMessage(validationError)
    }, [validationError])


    return <>
        <div className="evf">
            {/*** Close Icon ***/}
            <div className="evf__close">
                <img className="evf__close__img"  onClick={onCloseIconClicked} alt="close" src="/assets/images/icons/closeIcon.svg" />
            </div>

            {/*** Header ***/}
            <div className="evf__header">
                <h3 className="evf__header__title">{title}</h3>
                <div className="evf__header__desc"><p className="evf__header__desc__text">{desc}</p></div>
            </div>

            {/*** Body ***/}
            <form onSubmit={onEmailSubmitted} className="evf__body">
                <input onChange={onInputChange} ref={inputRef} placeholder="Enter Email Address" type="text" className={`evf__body__emailinput ${errorMessage ? 'evf__body__emailinput--error': ''}`} />
                {errorMessage && <p className="evf__body__error">{errorMessage}</p>}
                <div className="evf__body__submit">
                    <button className="evf__body__submit__btn">Send Code</button>
                </div>
            </form>
        </div>
        <style jsx>
            {
                `
            .evf {background: white; z-index: 51; position: relative; width: 650px; border-radius: 8px; padding: 24px 32px; min-height: 150px; }
            .evf__close {background: #475569; cursor: pointer; height: 26px; width: 26px; align-items: center; justify-content: center; position: absolute; right: -13px; top: -13px; border-radius: 50%; display: flex;  border: 1px solid rgba(255, 255, 255, 0.5);}
            .evf__header__title {font-size: 24px; font-weight: 700; color: #0F172A; line-height: 32px; margin-bottom: 10px;}
            .evf__header__desc {display: flex; align-items: center;}
            .evf__header__desc__text {font-size: 14px; color: #0F172A; line-height: 20px; }
            .evf__header__desc__img {cursor: pointer; margin-left: 6px; height: 16px; width: 16px;}
            .evf__body {padding: 10px 0;}
            .evf__body__emailinput {padding: 8px 12px; font-size: 14px; font-weight: 500; color: #475569; width: 100%; height: 40px;border: 1px solid #CBD5E1;border-radius: 8px;}
            .evf__body__emailinput--error {border:1px solid #DD2C5A;}
            .evf__body__submit{display: flex; justify-content: flex-end; width: 100%; margin-top: 30px;}
            .evf__body__submit__btn {padding: 8px 24px; font-weight: 600; color: white; height: 40px;background: linear-gradient(71.47deg, #427DFF 8.43%, #44D5BB 87.45%);box-shadow: 0px 1px 1px rgba(7, 8, 8, 0.16), inset 0px 1px 0px rgba(255, 255, 255, 0.16); border-radius: 100px;}
            .evf__body__emailinput:focus {outline: none;}
            .evf__body__error {color: #DD2C5A; font-size: 14px; font-weight: 500; margin-top: 8px;}
            `
            }
        </style>
    </>
}

export default EmailSubmissionForm