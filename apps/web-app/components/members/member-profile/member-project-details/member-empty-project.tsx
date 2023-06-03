import { useRouter } from 'next/router';
import { IMember } from '../../../../../web-app/utils/members.types';

export function MemberEmptyProject({
  userInfo,
  member,
}: {
  userInfo: any;
  member: IMember;
}) {
  const router = useRouter();
  const redirectToSettings = () => {
    router.push('/directory/settings');
  };

  return (
    <>
      {userInfo?.uid == member?.id ? (
        <div className="w-full rounded-xl border bg-gray-50 p-3">
          <p>
            To display your projects,{' '}
            <span
              className="cursor-pointer text-blue-700"
              onClick={redirectToSettings}
            >
              update profile
            </span>{' '}
            with your GitHub handle.
          </p>
        </div>
      ) : (
        <div className="w-full rounded-xl border bg-gray-50 p-3 text-center">
          <p>No projects to display</p>
        </div>
      )}
    </>
  );
}
