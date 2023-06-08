import React from 'react';
import Link from 'next/link';
import { ReactComponent as ProtocolLabsLogo } from '/public/assets/images/Logo_PLN_directory.svg';
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
          <div className='h-screen w-full flex flex-col justify-center'>
            <Link href="/directory">
              <a className="on-focus w-[150] mx-auto">
                <ProtocolLabsLogo
                  title="Protocol Labs Network Directory Beta Black Logo"
                  width="212"
                  height="60"
                />
              </a>
            </Link>
            <div className='text-lg text-center w-80 mx-auto'>Oops! Something went wrong. Please try again.</div>
            <Link href="/directory"><a className='text-[#156FF7] w-24 mx-auto'> Go to home </a></Link>
          </div> 
        );
      }
   
      // Return children components in case of no error
      return this.props.children;
    }
  }
   
  export default ErrorBoundary;
