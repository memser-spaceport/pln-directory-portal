import { ChangeEvent, useEffect, useState } from 'react';
import styles from './index.module.css';
import { InputField } from '@protocol-labs-network/ui';
import { useRouter } from 'next/router';
import { ReactComponent as Building } from '/public/assets/icons/building.svg';
import APP_CONSTANTS, { ROUTE_CONSTANTS } from '../utils/constants';
import { parseCookies } from 'nookies';
import Loader from '../components/common/loader';
import { ReactComponent as LogoImage } from '/public/assets/images/Back_office_Logo.svg';
import { GetServerSideProps } from 'next';

export function Index() {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  function onChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;
    name === 'name' ? setUsername(value) : setPassword(value);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Enter' || event.code === 'NumpadEnter') {
      event.preventDefault();
      event.stopPropagation();
      onSubmit();
    }
  }

  useEffect(() => {
    setIsLoading(isLoading);
  }, [isLoading]);

  const router = useRouter();
  async function onSubmit() {
    setIsLoading(true);
    try {
      await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })
        .then((res) => {
          if (res.ok) {
            const backLink = router.query.backlink?.toString() ?? '';
            router.push(backLink ? backLink : ROUTE_CONSTANTS.PENDING_LIST);
          } else if (res.status === 401) {
            setError('Incorrect Username and Password!');
          }
        })
        .catch((err) => {
          console.log('err>>>>', err);
          setError('Please try again!');
        })
        .finally(() => {
          setIsLoading(false);
        });
    } catch (error) {
      const usernameFromEnv = process.env.USERNAME;
      const passwordFromEnv = process.env.PASSWORD;

      if (username !== usernameFromEnv || passwordFromEnv !== password) {
        console.log('Invalid creds in catch');
        setError('Invalid creds!');
      }
      console.error('error>>>>', error);
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
        <div className="">
          <div className="p-2">
            <InputField
              name="name"
              label="Username"
              value={username}
              onChange={onChange}
              onKeyDown={onKeyDown}
              placeholder="Enter username"
              className="custom-grey custom-outline-none border"
            />
          </div>
          <div className="p-2">
            <InputField
              type="password"
              name="password"
              label="Password"
              value={password}
              onKeyDown={onKeyDown}
              onChange={onChange}
              placeholder="Enter password"
              className="custom-grey custom-outline-none border"
            />
          </div>
        </div>
        <div className="float-right pt-3">
          <button
            className="on-focus leading-3.5 text-md mr-2 rounded-full border border-slate-300 bg-blue-700 px-5 py-3 text-left font-medium text-white last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full disabled:bg-slate-400"
            onClick={onSubmit}
            disabled={!username || !password}
          >
            Login
          </button>
        </div>
        {error && (
          <div>
            <span className="text-md pt-2 text-red-400">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default Index;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { plnadmin } = parseCookies(context);

  if (plnadmin) {
    return {
      redirect: {
        destination: '/pending-list',
        permanent: false,
      },
    };
  }
  return {
    props: {},
  };
};
