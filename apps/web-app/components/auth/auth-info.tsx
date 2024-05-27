import { generateOAuth2State } from 'apps/web-app/utils/services/auth';
import axios from 'axios';
import { useRouter } from 'next/router';

function AuthInfo(props) {
  const router = useRouter();

  // Reset Url
  const clearPrivyParams = () => {
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
    const result = await axios.post(`${process.env.WEB_API_BASE_URL}/v1/auth`, {
      state: generateOAuth2State(),
    });
    localStorage.setItem('stateUid', result.data);
    document.dispatchEvent(new CustomEvent('privy-init-login'));
    router.push(`${window.location.pathname}${window.location.search}`);
  };
  return (
    <>
      <div className="ev">
        <div className="ev__cn">
          <div className="ev__en__box">
            <div className="content">
              <div className="infocn">
                <img onClick={clearPrivyParams} src="/assets/images/icons/close-grey.svg" className="infocn__close" />
                <div className="infocn__imgcn">
                  <img className="infocn__imgcn__img" src="/assets/images/auth/authinfo4.png" />
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
      <style jsx>
        {`
                .content { background: white; width:fit-content;  border-radius: 8px;}

                .infocn { position: relative; max-height: 598px; border-radius: 8px; height: 70svh; display: flex; background: white;}
                .infocn__close {position: absolute; top: 16px; right: 12px; width: 12px; height: 12px; cursor: pointer;}
                .infocn__imgcn__img {height: 100%; border-radius: 8px;}
                .infocn__imgcn {background: white; width: fit-content; height: 100%; padding: 8px; border-radius: 8px 0 0 8px;}
                .infocn__content {display: flex; padding: 16px; flex-direction: column; align-items: center; justify-content: center; max-width: 300px; flex: 1; height: 100%;}
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
    </>
  );
}

export default AuthInfo;
