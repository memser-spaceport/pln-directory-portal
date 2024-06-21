import { generateOAuth2State } from '../../utils/services/auth';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import Cookies from 'js-cookie';
import usePrivyWrapper from '../../hooks/auth/usePrivyWrapper';
import useAuthAnalytics from 'apps/web-app/analytics/auth.analytics';

function AuthInfo(props) {
  const router = useRouter();
  const { logout } = usePrivyWrapper();
  const analytics = useAuthAnalytics();
  const loginBanner = process.env.LOGIN_BANNER_URL;

  // Reset Url
  const onClose = () => {
    analytics.onAuthInfoClosed()
    const queryString = window.location.search.substring(1);
    const params = new URLSearchParams(queryString);
    let queryParams = `?`;
    params.forEach((value, key) => {
      if (!key.includes('privy_')) {
        queryParams = `${queryParams}${queryParams === '?' ? '' : '&'}${key}=${value}`;
      }
    });
    router.push(`${window.location.pathname}${queryParams === '?' ? '' : queryParams}`);
  };

  // Initiate Privy Login and get the auth code for state
  const onLogin = async () => {
    analytics.onProceedToLogin()
    localStorage.clear();
    await logout();  
      const result = await axios.post(`${process.env.WEB_API_BASE_URL}/v1/auth`, {
      state: generateOAuth2State(),
    });
    localStorage.setItem('stateUid', result.data);
    document.dispatchEvent(new CustomEvent('privy-init-login'));
    router.push(`${window.location.pathname}${window.location.search}`);
  };

  useEffect(() => {
    if (Cookies.get('refreshToken')) {
      router.push(`${window.location.pathname}${window.location.search}`);
    }
  }, []);

  return (
    <>
      <div className="authinfo">
        <div className="authinfo__cn">
          <div className="authinfo__cn__box">
            <div className="authinfo__cn__box__info">
              <img className='authinfo__cn__box__info__whatsnew' src="/assets/images/auth/auth-whatsnew.svg" />
              <h2 className="authinfo__cn__box__info__title">New Authentication Method</h2>
              <p className="authinfo__cn__box__info__text">
                We&apos;ve updated our authentication experience. You will need to login with your Directory profile email or link it to a login method of your choice. If you don&apos;t remember which email is tied to your Directory profile, please{' '}
                <a
                  className="link"
                  target="_blank"
                  rel="noreferrer"
                  href="https://www.plnetwork.io/contact?showModal=getSupport"
                >
                  contact us here
                </a>{' '}
                for assistance.
              </p>
              <button onClick={onLogin} className="authinfo__cn__box__info__btn">
                Proceed to Login
              </button>
            </div>
            <img
              onClick={onClose}
              src="/assets/images/icons/close-grey.svg"
              className="authinfo__cn__box__close"
            />
            <img className="authinfo__cn__box__img" src={loginBanner} alt='login banner' />
          </div>
          <div className="authinfo__cn__actions">
            <button onClick={onClose} className="authinfo__cn__actions__cancel">
              Cancel
            </button>
            <button onClick={onLogin} className="authinfo__cn__actions__login">
              Proceed to Login
            </button>
          </div>
        </div>
      </div>
      <style jsx>
        {`
         .link {
          color: #156FF7;
          font-weight: 600;
        }
        
          .authinfo {
            position: fixed;
            top: 0;
            z-index: 1000000;
            right: 0;
            left: 0;
            width: 100svw;
            height: 100%;
            background: rgb(0, 0, 0, 0.6);
          }
          .authinfo__cn {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            position: relative;
            align-items: center;
            justify-content: center;
          }
          .authinfo__cn__box {
            width: 90svw;
            max-height: calc(90svh - 72px);
            overflow-y: scroll;
            background: white;
            border-radius: unset;
            position: relative;
            padding: 8px;
            display: flex;
            flex-direction: column;
          }
          .authinfo__cn__box__close {
            display: none;
          }
          .authinfo__cn__box__info {
            padding: 24px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .authinfo__cn__box__info__title {
            font-size: 20px;
            font-weight: 700;
            line-height: 32px;
            margin-top: 12px;
            text-align: center;
          }
          .authinfo__cn__box__img {
            width: 100%;
            border-radius: 6px;
          }
          .authinfo__cn__box__info__text {
            font-size: 12px;
            font-weight: 400;
            text-align: center;
            line-height: 20x;
            padding: 16px 0;
          }
          .authinfo__cn__actions {
            background: white;
            width: 90svw;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            height: 72px;
            border-radius: 0 0 8px 8px;
          }
          .authinfo__cn__box__info__whatsnew {
            width: 136px;
          }
          .authinfo__cn__actions__cancel {
            padding: 10px 24px;
            border-radius: 8px;
            border: 1px solid #cbd5e1;
            font-size: 14px;
            font-weight: 500;
          }
          .authinfo__cn__actions__login {
            padding: 10px 24px;
            border-radius: 8px;
            background: #156ff7;
            color: white;
            font-size: 14px;
            font-weight: 500;
          }
          .authinfo__cn__box__info__btn {
            display: none;
          }

          @media (min-width: 1024px) {
            .authinfo__cn__actions {
              display: none;
            }
            .authinfo__cn__box {
              flex-direction: row;
              height: 70svh;
              max-height: 598px;
              width: fit-content;
              overflow: hidden;
              border-radius: 8px;
            }
            .authinfo__cn__box__img {
              order: 1;
              width: fit-content;
              height: 100%;
            }
            .authinfo__cn__box__info {
              order: 2;
              max-width: 300px;
              flex: 1;
              height: 100%;
            }
            .authinfo__cn__box__info__btn {
              display: flex;
              padding: 10px 24px;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 500;
              background: #156ff7;
              color: white;
            }
            .authinfo__cn__box__close {
              position: absolute;
              top: 16px;
              right: 16px;
              display: block;
              cursor: pointer;
              height: 12px;
              width: 12px;
            }
           
          }
        `}
      </style>
    </>
  );
}

export default AuthInfo;
