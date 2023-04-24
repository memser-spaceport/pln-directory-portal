import { useRouter } from 'next/router';
import { useEffect } from 'react';

const withAuth = (WrappedComponent) => {
  const AuthComponent = (props) => {
    const router = useRouter();
    const backLink = router?.asPath === '/' ? '' : router.asPath;
    useEffect(() => {
      const token = localStorage.getItem('back-office');
      if (!token) {
        router.push({
          pathname: '/',
          query: {
            ...(backLink !== '' && { backlink: backLink }),
          },
        });
      } else if (token && router.asPath == '/') {
        router.push({
          pathname: '/pending-list',
          query: {
            backlink: backLink,
          },
        });
      }
    }, []);

    return <WrappedComponent {...props} />;
  };

  return AuthComponent;
};

export default withAuth;
