import { FeedbackFish } from '@feedback-fish/react';
import Image from 'next/image';

export function Feedback() {
  return (
    <FeedbackFish projectId="35c7e855bf4651">
      <div className="fixed bottom-12 right-12 z-50 h-12 w-12 cursor-pointer rounded-full bg-blue-700 hover:bg-blue-700/90">
        <Image
          src="/assets/images/protocol-labs-network-small-logo-white.svg"
          alt="Protocol Labs Network small logo"
          layout="fill"
          objectFit="cover"
        />
      </div>
    </FeedbackFish>
  );
}
