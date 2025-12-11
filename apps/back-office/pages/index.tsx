import { ChangeEvent, useEffect, useState } from 'react';
import { InputField } from '@protocol-labs-network/ui';
import { useRouter } from 'next/router';
import { ReactComponent as Building } from '/public/assets/icons/building.svg';
import APP_CONSTANTS, { MemberRole } from '../utils/constants';
import { parseCookies } from 'nookies';
import Loader from '../components/common/loader';
import { ReactComponent as LogoImage } from '/public/assets/images/Back_office_Logo.svg';
import { GetServerSideProps } from 'next';

interface AdminUser {
  uid: string;
  email: string;
  name: string;
  roles: string[];
}

function getDefaultRedirect(user: AdminUser | null): string {
  if (!user) return '/members?filter=level1';

  const isDirectoryAdmin = user.roles?.includes(MemberRole.DIRECTORY_ADMIN);
  if (isDirectoryAdmin) {
    return '/members?filter=level1';
  }

  // DEMO_DAY_ADMIN users go directly to demo-days
  return '/demo-days';
}

export function Index() {
  const [email, setEmail] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [isOtpSent, setIsOtpSent] = useState<boolean>(false);

  const [error, setError] = useState<string>('');
  const [info, setInfo] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSendingOtp, setIsSendingOtp] = useState<boolean>(false);

  const router = useRouter();

  function onChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;

    if (name === 'email') {
      setEmail(value);
    }
    if (name === 'code') {
      setCode(value);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Enter' || event.code === 'NumpadEnter') {
      event.preventDefault();
      event.stopPropagation();

      if (!isOtpSent) {
        onSendOtp();
      } else {
        onSubmit();
      }
    }
  }

  useEffect(() => {
    setIsLoading(isLoading);
  }, [isLoading]);

  async function onSendOtp() {
    setError('');
    setInfo('');

    if (!email) {
      setError('Email is required');
      return;
    }

    setIsSendingOtp(true);

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        if (res.status === 400) {
          setError('Email is required');
        } else {
          setError('Failed to send OTP. Please try again.');
        }
        return;
      }

      const data = await res.json();
      if (data?.otpToken) {
        setOtpToken(data.otpToken);
        setIsOtpSent(true);
        setInfo('OTP code has been sent to your email.');
      } else {
        setError('OTP token is missing in response.');
      }
    } catch (e) {
      setError('Failed to send OTP. Please try again.');
    } finally {
      setIsSendingOtp(false);
    }
  }

  async function onSubmit() {
    setError('');
    setInfo('');

    if (!otpToken) {
      setError('Please request OTP first.');
      return;
    }

    if (!code) {
      setError('OTP code is required.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ otpToken, code }),
      });

      if (res.ok) {
        const data = await res.json();
        const backLink = router.query?.backLink as string | undefined;
        // Cookie 'plnadmin' is set by /api/login on successful OTP verification
        // Use window.location for hard redirect to ensure cookies are properly re-read
        // This prevents stale role data from previous sessions
        window.location.href = backLink ?? getDefaultRedirect(data?.user);
      } else if (res.status === 401) {
        setError('Invalid OTP code.');
      } else {
        setError('Authentication failed. Please try again.');
      }
    } catch (err) {
      setError('Please try again!');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative h-screen bg-gray-100">
      {isLoading && <Loader />}
      <div className="absolute left-[50%] top-[50%] w-[75%] translate-x-[-50%] translate-y-[-50%] rounded-lg bg-white p-8 md:w-[30%]">
        <div className="inline-block">
          <div className="inline-block">
            <LogoImage
              className="pl-3"
              height={95}
              width={195}
              alt="Protocol Labs Logo"
            />
          </div>
          <div className="fixed right-[30px] top-[66px] inline-block h-[29px] w-[113px] rounded-[4px] bg-[#9D3DE8] bg-opacity-10">
            <Building
              className="relative left-[7px] inline-block"
              title="building"
              width="14"
              height="20"
            />
            <span className="relative left-[10px] text-[14px] font-semibold text-[#9C3DE8]">
              {APP_CONSTANTS.BACK_OFFICE_LABEL}
            </span>
          </div>
        </div>

        <div className="p-2">
          <InputField
            name="email"
            label="Email"
            value={email}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder="Enter email"
            className="custom-grey custom-outline-none border"
          />
        </div>

        <div className="p-2">
          <InputField
            name="code"
            label="OTP code"
            value={code}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder="Enter OTP code"
            className="custom-grey custom-outline-none border"
            disabled={!isOtpSent}
          />
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <button
            type="button"
            onClick={onSendOtp}
            disabled={isSendingOtp || !email}
            className="rounded bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSendingOtp ? 'Sending...' : 'Send code'}
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!isOtpSent || !code}
            className="rounded bg-[#9D3DE8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8b32cf] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Log in
          </button>
        </div>

        {info && (
          <div className="pt-2">
            <span className="text-md text-green-500">{info}</span>
          </div>
        )}

        {error && (
          <div className="pt-2">
            <span className="text-md text-red-400">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default Index;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { plnadmin, plnadmin_user } = parseCookies(context);

  if (plnadmin) {
    let user: AdminUser | null;
    try {
      user = plnadmin_user ? JSON.parse(plnadmin_user) : null;
    } catch {
      user = null;
    }

    return {
      redirect: {
        destination: getDefaultRedirect(user),
        permanent: false,
      },
    };
  }

  return {
    props: {},
  };
};
