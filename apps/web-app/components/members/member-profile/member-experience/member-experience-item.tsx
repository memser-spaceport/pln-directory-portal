import { useState } from "react";

function MemberExperienceDescription(props) {
    const fullDesc = props.desc;
    const shortDesc = fullDesc;
    const [isShowMoreActive, showMoreStatus] = useState(false);
    const isBigDesc = fullDesc.length >= 300;

    const onShowMore = () => {
        showMoreStatus(true)
    }

    const onShowLess = () => {
        showMoreStatus(false)
    }

    return <>
        {isBigDesc && <div>

           {!isShowMoreActive &&  <p className="text-[14px] leading-[24px] text-[#475569]">{shortDesc.slice(0, 300)}<span>...</span><span onClick={onShowMore} className="text-[#156FF7] italic cursor-pointer">Show More</span></p>}
           {isShowMoreActive && <p className="text-[14px] leading-[24px] text-[#475569]">{fullDesc}<span onClick={onShowLess} className="text-[#156FF7] ml-[8px] italic cursor-pointer">Show Less</span></p>}

            </div>}

            {!isBigDesc && <p className="text-[14px] leading-[24px] text-[#475569]">{fullDesc}</p>}
    </>
}

export default MemberExperienceDescription