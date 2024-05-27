import { useRouter } from 'next/router';
import useLoginPopupStatus from '../../hooks/auth/useLoginPopupStatus';
import axios from 'axios';
import { generateOAuth2State } from '../../utils/services/auth';
import PrivyModals from './privy-modals';
import AuthInfo from './auth-info';
import AuthInvalidUser from './auth-invalid-user';
import { PrivyProvider } from '@privy-io/react-auth';

function AuthBox(props) {
  const { isLoginActive } = useLoginPopupStatus();

  return (
    <>
      <PrivyProvider
        appId={process.env.PRIVY_AUTH_ID}
        config={{
          appearance: {
            theme: 'light',
            accentColor: '#676FFF',
            landingHeader: 'PL Member Login',
          },
          loginMethods: ['email', 'google', 'github', 'wallet'],
        }}
      >
        <PrivyModals />
        <AuthInvalidUser />
        {isLoginActive === true && <AuthInfo />}
      </PrivyProvider>
    </>
  );
}

export default AuthBox;
