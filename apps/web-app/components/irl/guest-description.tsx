import { useState } from 'react';

interface IDescription {
  description: string;
}

const GuestDescription = (props: IDescription) => {
  const description = props?.description ?? '';
  const [isReadMore, setIsReadMore] = useState(true);

  const toggleReadMore = () => {
    setIsReadMore(!isReadMore);
  };

  if (description?.length <= 100) {
    return <div className='text-[13px] leading-[22px] font-[00] text-[#0F172A]'>{description}</div>;
  }

  return (
    <div>
      {isReadMore ? `${description?.slice(0, 100)}...` : description}
      <span onClick={toggleReadMore} className="cursor-pointer text-[13px] leading-[22px] font-[500] text-[#156FF7]">
        {isReadMore ? ' read more' : ' read less'}
      </span>
    </div>
  );
};

export default GuestDescription;
