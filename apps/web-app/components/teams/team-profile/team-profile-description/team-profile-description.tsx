import { useState } from 'react';

const MAX_CHARS = 196;

type TeamProfileDescriptionProps = {
  description?: string;
};

export default function TeamProfileDescription({
  description,
}: TeamProfileDescriptionProps) {
  const [isHidden, setIsHidden] = useState(true);
  const isLong = description?.length > MAX_CHARS;

  return (
    <>
      {isHidden && isLong ? (
        <div>
          {`${description.substring(0, MAX_CHARS)}... `}
          <button
            className="text-xs text-slate-400"
            onClick={() => setIsHidden(false)}
          >
            Show more
          </button>
        </div>
      ) : !isHidden && isLong ? (
        <div>
          {description}{' '}
          <button
            className="text-xs text-slate-400"
            onClick={() => setIsHidden(true)}
          >
            Show less
          </button>
        </div>
      ) : (
        <p>{description}</p>
      )}
    </>
  );
}
