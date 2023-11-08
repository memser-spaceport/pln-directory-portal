import { AskToEditCard } from '../../../../../web-app/components/shared/profile/ask-to-edit-card/ask-to-edit-card';
import { IMember } from '../../../../../web-app/utils/members.types';

export function MemberEmptyProject({
  userInfo,
  member,
  profileType,
}: {
  userInfo: any;
  member: IMember;
  profileType: string;
}) {
  return (
    <>
      {userInfo?.uid == member?.id && member?.githubHandle ? (
        <div className="w-full rounded-xl border bg-gray-50 p-3 text-center">
          <p>No repositories to display</p>
        </div>
      ) : (
        <>
          {userInfo?.uid == member?.id && member?.githubHandle == null ? (
            <div className="w-full rounded-xl border bg-gray-50 p-3">
              <p className="flex items-center gap-0.5">
                GitHub handle is missing. Please update your profile <span />
                <span className="cursor-pointer text-blue-700">
                  <AskToEditCard
                    profileType="member"
                    member={member}
                    userInfo={userInfo}
                    from="git"
                  />
                </span>{' '}
              </p>
            </div>
          ) : (
            <>
              {userInfo.uid === member.id ||
              (userInfo.roles?.length > 0 &&
                userInfo.roles.includes('DIRECTORYADMIN')) ? (
                <>
                  {member?.githubHandle == null ? (
                    <div className="w-full rounded-xl border bg-gray-50 p-3">
                      <p className="flex items-center gap-0.5">
                        GitHub handle is missing for the user. If you have the
                        required information, please update
                        <span />
                        <span className="cursor-pointer text-blue-700">
                          <AskToEditCard
                            profileType="member"
                            member={member}
                            userInfo={userInfo}
                            from="git"
                          />
                        </span>{' '}
                      </p>
                    </div>
                  ) : (
                    <div className="w-full rounded-xl border bg-gray-50 p-3">
                      <p className="flex items-center gap-0.5">
                        {member?.githubHandle ? (
                          <div className="w-full rounded-xl  bg-gray-50 text-center">
                            <p>No repositories to display</p>
                          </div>
                        ) : (
                          <>
                          `GitHub handle is missing. Please update the profile `
                          <span className="cursor-pointer text-blue-700">
                          <AskToEditCard
                            profileType="member"
                            member={member}
                            userInfo={userInfo}
                            from="git"
                          />
                        </span>{' '}
                        </>
                        )}
                        <span />

                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full rounded-xl border bg-gray-50 p-3 text-center">
                  <p>No repositories to display</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
