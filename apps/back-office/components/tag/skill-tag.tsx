import { SkillDto } from '@protocol-labs-network/contracts';
import { Tooltip } from '@protocol-labs-network/ui';
import { Skill } from 'apps/back-office/utils/members.types';
import React from 'react';

interface SkillTagProps {
  value: string;
  remainContent?: Skill[];
}

const SkillTag = ({ value, remainContent }: SkillTagProps) => {
  return (
    <>
      {value && (
        <Tooltip
          trigger={<div className="tag">{value}</div>}
          content={remainContent ? `${remainContent.map((skill: SkillDto) => skill.title).join(', ')}` : value}
        />
      )}
      <style jsx>{`
        .tag {
          background-color: rgb(241, 245, 249);
          height: 25px;
          line-height: 20px;
          padding: 3px 10px;
          border-radius: 50px;
          font-size: 12px;
          font-weight: 500;
          border: 1px solid rgb(203, 213, 225);
          background-color: white;
          color: rgb(108, 123, 145);
          cursor: pointer;
          background-color: rgb(241, 245, 249);
          border: none;
        }
      `}</style>
    </>
  );
};

export default SkillTag;
