import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

function useLoginPopupStatus() {
  const { authenticated, logout, unlinkEmail, user,  } = usePrivy();
  const [isLoginActive, setLoginStatus] = useState(false);
  const router = useRouter();

  useEffect(() => {
    console.log('useeffect in hook', authenticated)
    setLoginStatus(window.location.hash === '#login');
  }, [router]);
  return {
    isLoginActive
  }
}

export default useLoginPopupStatus;
