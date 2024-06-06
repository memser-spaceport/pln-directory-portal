import { generateOAuth2State } from 'apps/web-app/utils/services/auth';
import axios from 'axios';
import { useEffect, useState } from 'react';

export function AuthErrorModal() {
  const [isOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const onModalClose = () => {
    document.dispatchEvent(new CustomEvent('app-loader-status'))
    setIsModalOpen(false);
  };

  const onLogin = async () => {
    const result = await axios.post(`${process.env.WEB_API_BASE_URL}/v1/auth`, {
      state: generateOAuth2State(),
    });
    localStorage.setItem('stateUid', result.data);
    document.dispatchEvent(new CustomEvent('auth-link-account', {detail: 'updateEmail'}));
    setIsModalOpen(false)
  }

  useEffect(() => {
    function handleInfo(e) {
      if(e.detail === 'email_changed'){
        setTitle('Email Update Required');
        setDescription('Your email has been changed recently in our system. Please update the email associated with the social account (Google/GitHub/Wallet) you are using to log in.');
        setIsModalOpen(true)
      }
    }
    document.addEventListener('auth-info-modal',handleInfo )
    return function() {
        document.removeEventListener('auth-info-modal',handleInfo )
    }
  }, [])
  return (
    <>
      {isOpen && <div className="errorinfo">
        <div className="errorinfo__cn">
          <div className="errorinfo__cn__box">
            <h2 className="errorinfo__cn__box__title">{title}</h2>
            <p className="errorinfo__cn__box__text">{description}</p>
            <div className='errorinfo__cn__box__actions'>
            <button onClick={onLogin} className="errorinfo__cn__box__actions__btn">Proceed to Update Email</button>
            </div>

            <img
              onClick={onModalClose}
              src="/assets/images/icons/close-grey.svg"
              className="errorinfo__cn__box__close"
            />
          </div>
        </div>
      </div>}
      <style jsx>
        {`
          .errorinfo {
            position: fixed;
            top: 0;
            z-index: 2000;
            right: 0;
            left: 0;
            width: 100svw;
            height: 100%;
            background: rgb(0, 0, 0, 0.6);
          }
          .errorinfo__cn {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            position: relative;
            align-items: center;
            justify-content: center;
          }
          .errorinfo__cn__box {
            width: 85svw;
            background: white;
            border-radius: unset;
            position: relative;
            border-radius: 8px;
            padding: 32px;
          }

          .errorinfo__cn__box__title {
            font-size: 24px;
            font-weight: 700;
            line-height: 32px;
            text-align: center;
          }
          .errorinfo__cn__box__img {
            width: 100%;
            border-radius: 6px;
          }
          .errorinfo__cn__box__text {
            font-size: 15px;
            font-weight: 400;
            text-align: center;
            line-height: 20x;
            text-align: center;
            margin: 12px 0;
          }
          
          .errorinfo__cn__box__actions {
            width: 100%;
            display: flex;
            justify-content: center;
          }
          .errorinfo__cn__box__actions__btn {
            padding: 10px 24px;
            border-radius: 8px;
            background: #156ff7;
            color: white;
            font-size: 14px;
            font-weight: 500;
           
          }

          .errorinfo__cn__box__close {
            position: absolute;
            top: 16px;
            right: 16px;
            display: block;
            cursor: pointer;
            height: 16px;
            width: 16px;
          }

          @media (min-width: 1024px) {
            .errorinfo__cn__box {
              width: 700px;
            }
            .errorinfo__cn__box__title {
              text-align: left
            }
            .errorinfo__cn__box__text {
              text-align: left
            }
            .errorinfo__cn__box__actions {
              justify-content: flex-end;
            }
  
          }
        `}
      </style>
    </>
  );
}
