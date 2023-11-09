import { trackGoal } from 'fathom-client';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import React, { useState } from 'react';
import { FATHOM_EVENTS } from '../../../../constants';
// import { LoginModal } from './login-modal';
// import { ForgotEmailModal } from './forgot-email-modal';
import { authenticate } from '../../../../utils/services/auth';
import { LoadingIndicator } from 'apps/web-app/components/shared/loading-indicator/loading-indicator';
export function Login() {
  const [loaderFlag, setLoaderFlag] = useState(false);
  const loginAsUserCode = FATHOM_EVENTS.directory.loginAsUser;
  const router = useRouter();
  // const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  // const [isForgotEmailModalOpen, setIsForgotEmailModalOpen] = useState(false);
  const handleOpenModal = () => {
    if (Cookies.get("userInfo")) {
      Cookies.set('page_params', 'user_logged_in', { expires: 60, path: '/' });
      router.push("/members");
    } else {
      setLoaderFlag(true);
      authenticate(router.asPath);
      trackGoal(loginAsUserCode, 0);
    }
  };
  return (
    <>
      {loaderFlag && (
        <div
          className={`fixed inset-0 z-[3000] flex h-screen w-screen items-center justify-center bg-gray-500 bg-opacity-75 outline-none transition-opacity`}
        >
          <LoadingIndicator />
        </div>
      )}
      <button
        onClick={handleOpenModal}
        className="shadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus ml-3.5 inline-flex w-20 justify-center rounded-full bg-gradient-to-r from-[#427DFF] to-[#44D5BB] px-6 py-2 text-base font-semibold leading-6 text-white outline-none hover:from-[#1A61FF] hover:to-[#2CC3A8]"
      >
        Login
      </button>
      {/* <LoginModal
        isOpen={isLoginModalOpen}
        setIsModalOpen={setIsLoginModalOpen}
        setIsForgotEmailModalOpen={setIsForgotEmailModalOpen}
      />
      <ForgotEmailModal
        isOpen={isForgotEmailModalOpen}
        setIsModalOpen={setIsForgotEmailModalOpen}
      /> */}
    </>
  );
}
