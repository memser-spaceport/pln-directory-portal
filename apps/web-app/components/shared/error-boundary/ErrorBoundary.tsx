import React from 'react';
import Image from 'next/image';
import Link from 'next/link'
import { ReactComponent as ProtocolLabsLogo } from '/public/assets/images/pln_logo.svg';
import { ReactComponent as Thunder } from '/public/assets/images/icons/thunder.svg';
import { ReactComponent as Error } from '/public/assets/images/icons/error.svg';
class ErrorBoundary extends React.Component<{}, { hasError: boolean }> {
    constructor(props) {
      super(props);
      // Define a state variable to track whether is an error or not
      this.state = { hasError: false };
    }
    static getDerivedStateFromError(error) {
      // Update state so the next render will show the fallback UI
      return { hasError: true };
    }
    componentDidCatch(error, errorInfo) {
      // You can use your own error logging service here
      console.log({ error, errorInfo });
    }
    render() {
      // Check if the error is thrown
      if (this.state.hasError) {
        // You can render any custom fallback UI
        return (
          <div className='h-screen w-full flex flex-col justify-center items-center'>
             <Link href="/directory">
              <a className="on-focus w-[150] mx-auto mb-7">
                <ProtocolLabsLogo
                  title="Protocol Labs Directory Beta Black Logo"
                  width="212"
                  height="60"
                />
              </a>
            </Link>
            <div className='w-[500px] h-96 bg-white flex flex-col justify-center items-center rounded-md'>
              <div className="relative">
                <Image
                  src='/assets/images/error.png'
                  width={350}
                  height={150}
                  alt="Profile Picture"
                  quality={100}
                  className="relative"
                  >
                </Image>
                <Thunder className="absolute w-7 h-7 left-18 top-5"/>
                <Error className="absolute w-6 h-6 right-20 top-20"/>
              </div>
              <div className='text-2xl text-center w-[350px] font-bold mt-5'>Oh snap! Something went wrong!</div>
              <button
                onClick={() => {
                  window.location.href='/';
                }}
                className="shadow-special-button-default inline-flex w-40 mt-8 justify-center rounded-full bg-[#156FF7] px-6 py-2 text-base font-semibold leading-6 text-white outline-none"
              > Back to home
              </button>
            </div>
          </div>
        );
      }

      // Return children components in case of no error
      return this.props.children;
    }
  }

  export default ErrorBoundary;
