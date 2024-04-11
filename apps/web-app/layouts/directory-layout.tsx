import { Navbar } from '../components/layout/navbar/navbar';
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import ErrorBoundary from '../components/shared/error-boundary/ErrorBoundary';
import { MobileNavbar } from '../components/layout/navbar/mobile-navbar';


// Check that PostHog is client-side (used to handle Next.js SSR)
if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    // Enable debug mode in development
    loaded: (posthog) => {
      if (process.env.NODE_ENV === 'development') posthog.debug()
    }
  })
}

export function DirectoryLayout(props:any) {
  const children = props.children;
  const isIrlPage = props.isIrlPage;
  // Second children is acutual page element.
  const childrens = children.props.children;
  return (
    <ErrorBoundary>
      <PostHogProvider client={posthog}>
        {!isIrlPage &&  <Navbar
          isUserLoggedIn={childrens?.[1]?.props?.isUserLoggedIn}
          userInfo={childrens?.[1]?.props?.userInfo || {}}
        />}
         {isIrlPage && <><div className='block lg:hidden'><MobileNavbar
          isUserLoggedIn={childrens?.[1]?.props?.isUserLoggedIn}
          userInfo={childrens?.[1]?.props?.userInfo || {}}
        /></div>
        <div className='hidden lg:block'>
        <Navbar
          isUserLoggedIn={childrens?.[1]?.props?.isUserLoggedIn}
          userInfo={childrens?.[1]?.props?.userInfo || {}}
        />
        </div>
        
        </>}
        {!isIrlPage && <main className="min-w-[1272px]">{children}</main>}
        {isIrlPage && <main className='w-[100%] min-w-[100%]'>{children}</main>}
      </PostHogProvider>
    </ErrorBoundary>
  );
}
