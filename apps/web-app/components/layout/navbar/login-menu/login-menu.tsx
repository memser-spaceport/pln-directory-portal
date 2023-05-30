import { trackGoal } from 'fathom-client';
import Cookies from 'js-cookie';
import { useRouter } from 'next/router';
import React, { useState } from 'react';
import { FATHOM_EVENTS } from '../../../../constants';
// import { LoginModal } from './login-modal';
// import { ForgotEmailModal } from './forgot-email-modal';
import { authenticate } from '../../../../utils/services/auth';
export function Login() {
  const loginAsUserCode = FATHOM_EVENTS.directory.loginAsUser;
  const router = useRouter();
  // const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  // const [isForgotEmailModalOpen, setIsForgotEmailModalOpen] = useState(false);
  const handleOpenModal = () => {
    if (Cookies.get("userInfo")) {
      Cookies.set('page_params', 'user_logged_in', { expires: 60, path: '/' });
      router.push("/directory/members");
    } else {
      authenticate();
      trackGoal(loginAsUserCode, 0);
    }
  };
  return (
    <>
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
