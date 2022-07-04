export default function Index() {
  return <div></div>;
}

export const getServerSideProps = async () => {
  return {
    redirect: {
      permanent: false,
      destination: '/teams',
    },
  };
};
