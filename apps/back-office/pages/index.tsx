import { ChangeEvent, useEffect, useState } from 'react';
import Image from 'next/image';
import styles from './index.module.css';
import { InputField } from '@protocol-labs-network/ui';
import { useRouter } from 'next/router';
import { ReactComponent as Building } from '/public/assets/icons/building.svg';
import APP_CONSTANTS, { ROUTE_CONSTANTS, TOKEN } from '../utils/constants';
import { setToken } from '../utils/auth';
import Loader from '../components/common/loader';

export function Index() {
  const [userName, setUserName] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  function onChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;
    name === 'name' ? setUserName(value) : setPassword(value);
  }

  useEffect(() => {
    setIsLoading(isLoading);
  }, [isLoading]);

  const router = useRouter();
  async function onSubmit() {
    setIsLoading(true);
    if (
      userName === process.env.NEXT_PUBLIC_USERNAME &&
      password === process.env.NEXT_PUBLIC_PASSWORD
    ) {
      setToken(TOKEN);
      setIsLoading(false);
      router.push(ROUTE_CONSTANTS.PENDING_LIST);
    } else {
      setIsLoading(false);
      setError('Incorrect Username and Password!');
    }
  }

  return (
    <div className="relative h-screen bg-gray-100">
      {isLoading && <Loader />}
      <div className="absolute left-[50%] top-[50%] w-[75%] translate-x-[-50%] translate-y-[-50%] rounded-lg bg-white p-8 md:w-[30%]">
        <div className="inline-block">
          <div className="inline-block">
            <Image
              src="/assets/images/protocol-labs-network-open-graph.png"
              height={100}
              width={200}
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
              label="UserName"
              value={userName}
              onChange={onChange}
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
            disabled={!userName || !password}
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
