import { SpinnerIcon } from '@protocol-labs-network/ui';
import { useEffect, useState } from 'react';

export function AppLoader() {
  const [isActive, setActiveStatus] = useState(false);
  useEffect(() => {
    function handleLoader(e) {
      console.log(e);
      if (e.detail) {
        setActiveStatus(e.detail);
      }
    }
    document.addEventListener('app-loader-status', handleLoader);
    return function () {
      document.removeEventListener('app-loader-status', handleLoader);
    };
  }, []);
  return (
    <>
      {isActive && <div className="ap">
        <div className="ap__box flex items-center justify-center bg-white text-sm text-slate-600 shadow-md">
          <i className="mr-3 h-5 w-5 animate-spin text-blue-600">
            <SpinnerIcon />
          </i>
          <span>Loading...</span>
        </div>
      </div>}
      <style jsx>
        {`
          .ap {
            background: rgb(255, 255, 255, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 100vh;
            width: 100vw;
            z-index: 1000;
          }
          .ap__box {
            width: 200px;
            padding: 16px 24px;
          }
        `}
      </style>
    </>
  );
}
