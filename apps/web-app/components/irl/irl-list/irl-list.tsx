'use client';

import { IIrlCard } from 'apps/web-app/utils/irl.types';
import IrlCard from './irl-card';

interface IIrlList {
  conference: IIrlCard[];
}

export default function IrlList(props: IIrlList) {
  //props
  const conference = props.conference;

  return (
    <>
      <div className="irlList">
        {conference.length > 0 ? conference?.map((item, index: number) => (
          <IrlCard key={index} {...item} />
        )):<p>No events available</p>}
      </div>
      <style jsx>
        {`
          .irlList {
            width: 100%;
            height: 100%;
            padding: 20px 0;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            justify-content: center;
            gap: 16px;
            margin: auto;
          }

          @media (min-width: 1024px) {
            .irlList {
              padding: 24px 0;
              justify-content: flex-start;
            }
          }
        `}
      </style>
    </>
  );
}
