import { useState } from 'react';
import Image from 'next/image';
import styles from './index.module.css';
import { InputField } from '@protocol-labs-network/ui';

export function Index() {
  const [userName, setUserName] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  /*
   * Replace the elements below with your own.
   *
   * Note: The corresponding styles are in the ./index.css file.
   */
  return (
    <div className="relative h-screen bg-gray-100">
      <div className="absolute left-[50%] top-[50%] w-[75%] translate-x-[-50%] translate-y-[-50%] rounded-lg bg-white p-8 md:w-[30%]">
        <div className="flex">
          <div>
            <Image
              src="/assets/images/protocol-labs-network-open-graph.png"
              height={100}
              width={200}
              alt="Protocol Labs Logo"
            />
          </div>
          <div></div>
        </div>
        <div className="">
          <div className="p-2">
            <InputField
              name="name"
              label="UserName"
              value={userName}
              // onChange={onChange}
              placeholder="Enter username"
              className="border-1 border-gray-300"
            />
          </div>
          <div className="p-2">
            <InputField
              type="password"
              name="name"
              label="Password"
              value={userName}
              // onChange={onChange}
              placeholder="Enter password"
              className="border-1 border-gray-300"
            />
          </div>
        </div>
        <div className="float-right pt-3">
          <button
            className="on-focus leading-3.5 text-md mr-2 rounded-full border border-slate-300 bg-blue-700 px-5 py-3 text-left font-medium text-white last:mr-0 focus-within:rounded-full hover:border-slate-400 focus:rounded-full focus-visible:rounded-full"
            onClick={() => null}
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
}

export default Index;
