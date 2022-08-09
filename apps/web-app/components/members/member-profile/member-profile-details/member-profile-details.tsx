import { IMember } from '@protocol-labs-network/api';
import { Tooltip } from '@protocol-labs-network/ui';
import { ProfileSocialLink } from '../../../shared/profile/profile-social-link/profile-social-link';
import { TagsGroup } from '../../../shared/tags-group/tags-group';

export function MemberProfileDetails({
  skills,
  email,
  twitter,
  discordHandle,
  githubHandle,
}: IMember) {
  return (
    <>
      <div className="mt-6">
        {skills?.length ? <TagsGroup items={skills} /> : '-'}
      </div>
      <div className="mt-4 flex space-x-6">
        <div className="flex w-1/4 flex-col items-start">
          <h2 className="detail-label">Email</h2>
          {email ? (
            <Tooltip
              asChild
              trigger={<ProfileSocialLink url={email} type="email" />}
              content={email}
            />
          ) : (
            '-'
          )}
        </div>
        <div className="flex w-1/4 flex-col items-start">
          <h2 className="detail-label">Twitter</h2>
          {twitter ? (
            <Tooltip
              asChild
              trigger={<ProfileSocialLink url={twitter} type="twitter" />}
              content={twitter}
            />
          ) : (
            '-'
          )}
        </div>
        <div className="flex w-1/4 flex-col items-start">
          <h2 className="detail-label">Discord</h2>
          {discordHandle ? (
            <Tooltip
              asChild
              trigger={
                <span className="line-clamp-1 break-all">{discordHandle}</span>
              }
              content={discordHandle}
            />
          ) : (
            '-'
          )}
        </div>
        <div className="flex w-1/4 flex-col items-start">
          <h2 className="detail-label">Github</h2>
          {githubHandle ? (
            <Tooltip
              asChild
              trigger={<ProfileSocialLink url={githubHandle} type="github" />}
              content={githubHandle}
            />
          ) : (
            '-'
          )}
        </div>
      </div>
    </>
  );
}
