import { useLogin, usePrivy, useLinkAccount } from '@privy-io/react-auth';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import useLoginPopupStatus from '../../hooks/auth/useLoginPopupStatus';
import axios from 'axios';
import Cookies from 'js-cookie';
import { calculateExpiry, decodeToken, generateOAuth2State } from '../../utils/services/auth';

function AuthBox(props) {
  const { authenticated, logout, unlinkEmail, ready, linkGoogle, linkWallet, user, getAccessToken } = usePrivy();
  const { isLoginActive } = useLoginPopupStatus();
  const [linkAccountKey, setLinkAccountKey] = useState('')

  const router = useRouter();
  const { login } = useLogin({
    onComplete: (user) => {
        console.log(user, 'logged in user')
        if (!user?.email?.address) {
          document.dispatchEvent(new CustomEvent('auth-link-account', { detail: 'email' }));
          return;
        } else {
          const userInfo = Cookies.get('userInfo');
          const accessToken = Cookies.get('accessToken');
          const refreshToken = Cookies.get('refreshToken');
          if (!userInfo && !accessToken && !refreshToken) {
            document.dispatchEvent(new CustomEvent('initiate-dir-login'))
          }
        }
    },
    onError: (error) => {
      logout()
      toast.error('Something went wrong. Please try again later');
    },
  });

  const { linkEmail, linkGithub} = useLinkAccount({
    onSuccess: (user, linkMethod, linkedAccount) => {
      console.log(linkMethod, 'linkedMethod');
      if (linkMethod === 'email') {
         document.dispatchEvent(new CustomEvent('initiate-dir-login'))
      } else if (linkMethod === 'github') {
        toast.success('Github linked successfully')
      }
    },
    onError: (error) => {
      console.log(error, 'link error');
      logout()
    },
  });

  

  const onLogin = async () => {
    const result = await axios.post(`${process.env.AUTH_API_URL}/auth`, {
      state: generateOAuth2State(),
      client_id: process.env.AUTH_APP_CLIENT_ID,
    });
    localStorage.setItem('stateUid', result.data.uid);
    login();
    router.push(`${window.location.pathname}${window.location.search}`)
  };

  const clearPrivyParams = () => {
    const queryString = window.location.search.substring(1);
    const params = new URLSearchParams(queryString);
    let queryParams = `?`;
    params.forEach((value, key) => {
      if (!key.includes('privy_')) {
        queryParams = `${queryParams}${queryParams === '?' ? '' : '&'}${key}=${value}`;
      }
      console.log(`Key: ${key}, Value: ${value}`);
    });
    router.push(`${window.location.pathname}${queryParams === '?' ? '' : queryParams}`);
  };

  const resetLogin = () => {
    clearPrivyParams();
  };

  useEffect(() => {
    if (linkAccountKey === 'github') {
      linkGithub();
    } else if (linkAccountKey === 'google') {
      linkGoogle();
    } else if (linkAccountKey === 'wallet') {
      linkWallet();
    } else if (linkAccountKey === 'email') {
      linkEmail();
    }
  }, [linkAccountKey]);

  
  useEffect(() => {
    const handleEmailLink = (e) => {
      setLinkAccountKey(e.detail)
    };
    document.addEventListener('auth-link-account', handleEmailLink);
    return function () {
      document.removeEventListener('auth-link-account', handleEmailLink);
    };
  }, []);


  useEffect(() => {
    const processLogin = () => {
      getAccessToken()
        .then((token) => {
          return axios.post(`${process.env.WEB_API_BASE_URL}/v1/auth/token`, {
            exchangeRequestToken: token,
            exchangeRequestId: localStorage.getItem('stateUid'),
            grantType: 'token_exchange',
          });
        })
        .then((d) => {
          const output = d.data;
          const accessTokenExpiry = decodeToken(output.accessToken);
          const refreshTokenExpiry = decodeToken(output.refreshToken);
          localStorage.removeItem('stateUid');
          Cookies.set('authToken', JSON.stringify(output.accessToken), {
            expires: calculateExpiry(new Date(accessTokenExpiry.exp)),
            domain: process.env.COOKIE_DOMAIN || '',
          });
  
          Cookies.set('refreshToken', JSON.stringify(output.refreshToken), {
            expires: calculateExpiry(new Date(refreshTokenExpiry.exp)),
            path: '/',
            domain: process.env.COOKIE_DOMAIN || '',
          });
          Cookies.set('userInfo', JSON.stringify(output.userInfo), {
            expires: calculateExpiry(new Date(accessTokenExpiry.exp)),
            path: '/',
            domain: process.env.COOKIE_DOMAIN || '',
          });
  
          if (output.userInfo?.isFirstTimeLogin) {
            router.push('/settings');
          }
          clearPrivyParams();
          setLinkAccountKey('')
          toast.success('Successfully Logged In');
        })
        .catch((error) => {
          console.error(error);
          if(user?.email?.address) {
            unlinkEmail(user?.email?.address);
            setLinkAccountKey('')
            logout()
            toast.error('Email entered doesnt exist in directory')
          }
         
          
          //setEmailLinkError(true)
          //logout()
        });
    };
    document.addEventListener('initiate-dir-login', processLogin);
    return function () {
      document.removeEventListener('initiate-dir-login', processLogin);
    };
  }, [unlinkEmail, user, logout]);


  return (
    <>
      {isLoginActive === true && (
        <div className="ev">
          <div className="ev__cn">
            <div className="ev__en__box">
              <div className="content">
                <div className="infocn">
                  <img onClick={resetLogin} src="/assets/images/icons/close-grey.svg" className="infocn__close" />
                  <div className="infocn__imgcn">
                    <img className="infocn__imgcn__img" src="/assets/images/auth/auth_info2.svg" />
                  </div>
                  <div className="infocn__content">
                    <h2 className="infocn__content__title">New Authentication Method</h2>
                    <p className="infocn__content__info">
                      We are updating our authentication service. You may need to do a one time verification of your
                      Directory Membership email at the time of login. Reach out to us at in case you dont remember the
                      linked email
                    </p>
                    <button className="infocn__content__login" onClick={onLogin}>
                      Proceed To Login
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {authenticated && (
        <button className="fixed top-[8px] right-[280px] z-[60] cursor-pointer" onClick={logout}>
          Logout
        </button>
      )}
      {authenticated && (
        <button
          className="fixed top-[8px] right-[200px] z-[60] cursor-pointer"
          onClick={() => unlinkEmail(user.email.address)}
        >
          UNlink
        </button>
      )}
      <style jsx>
        {`
                .content { background: white; width:fit-content;  border-radius: 8px;}

                .infocn {max-width: 796px; width: 65vw; position: relative; max-height: 598px; border-radius: 8px; height: 70svh; display: flex; background: white;}
                .infocn__close {position: absolute; top: 16px; right: 12px; width: 12px; height: 12px; cursor: pointer;}
                .infocn__imgcn__img {height: 100%; border-radius: 8px;}
                .infocn__imgcn {background: white; width: fit-content; height: 100%; padding: 8px; border-radius: 8px 0 0 8px;}
                .infocn__content {display: flex; padding: 16px; flex-direction: column; align-items: center; justify-content: center; flex: 1; height: 100%;}
                .infocn__content__title {font-weight: 700; text-align:center; font-size: 20px;}
                .infocn__content__info {font-weight: 400; font-size: 14px; text-align: center; margin: 16px 0;}
                .infocn__content__login {background: #156FF7; padding: 10px 24px; border-radius: 8px; color: white;}
                .ev {position: fixed; top:0; z-index: 2000; right:0; left:0; width: 100svw; height: 100svh; background: rgb(0,0,0,0.6); }
                .ev__cn {width: 100%; height: 100%; display: flex; position: relative; align-items: center; justify-content: center;}
                .ev__loader {position: absolute; background: rgb(255,255,255, 0.7); display: flex; align-items: center; justify-content: center; z-index:52; width: 100%; height: 100%; top:0; right:0; left:0;}
                .ev__en__box {width:fit-content; height:fit-content; position: relative; overf}
                .ev__en__box__error {background: white; z-index: 51; position: relative; width: 650px; border-radius: 8px; padding: 24px 32px; min-height: 150px; }
                `}
      </style>
      <style jsx global>
        {`
          #privy-modal-content {
            overflow-y: auto !important;
            scrollbar-width: thin;
          }
          #privy-modal-content img[alt='PL Network logo'] {
            max-width: none !important;
            width: 100% !important;
            object-fit: cover;
            object-position: top;
            margin: 0;
            padding: 0;
            max-height: fit-content !important;
          }
          div:has(> img[alt='PL Network logo']) {
            padding: 0;
          }
          .hide-on-mobile {
            display: none !important;
          }
        `}
      </style>
    </>
  );
}

export default AuthBox;
