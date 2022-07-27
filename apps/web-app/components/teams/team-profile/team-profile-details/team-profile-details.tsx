import { ITeam } from '@protocol-labs-network/api';
import { CollapsibleText } from '@protocol-labs-network/ui';

export function TeamProfileDetails({
  website,
  twitter,
  longDescription,
  shortDescription,
}: ITeam) {
  return (
    <>
      <div className="flex">
        <div className="w-1/2">
          <h2 className="detail-label">Website</h2>
          <p>{website || '-'}</p>
        </div>
        <div className="w-1/2">
          <h2 className="detail-label">Twitter</h2>
          <p>{twitter || '-'}</p>
        </div>
      </div>
      <div>
        <h2 className="detail-label">About</h2>
        <CollapsibleText
          maxChars={500}
          txt={longDescription || shortDescription || '-'}
        />
      </div>
    </>
  );
}
