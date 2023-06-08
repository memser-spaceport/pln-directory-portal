import { Navbar } from '../components/layout/navbar/navbar';
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import ErrorBoundary from '../components/shared/error-boundary/ErrorBoundary';


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

export function DirectoryLayout({ children }) {
  // Second children is acutual page element.
  const childrens = children.props.children;
  return (
    <ErrorBoundary>
      <PostHogProvider client={posthog}>
        <Navbar
          isUserLoggedIn={childrens?.[1]?.props?.isUserLoggedIn}
          userInfo={childrens?.[1]?.props?.userInfo || {}}
        />
        <main className="min-w-[1272px] pt-20">{children}</main>
      </PostHogProvider>
    </ErrorBoundary>
  );
}
