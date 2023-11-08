import { useState } from "react";
import { sanitize, isSupported } from "isomorphic-dompurify";
import clip from "text-clipper";
import useAppAnalytics from "apps/web-app/hooks/shared/use-app-analytics";
import { APP_ANALYTICS_EVENTS } from "apps/web-app/constants";
function MemberExperienceDescription(props) {
    const fullDesc = props.desc;
    const exp = props?.exp
    const shortDesc = fullDesc;
    const [isShowMoreActive, showMoreStatus] = useState(false);
    const isBigDesc = fullDesc.length >= 300;
    const analytics = useAppAnalytics()

    const onShowMore = () => {
        analytics.captureEvent(APP_ANALYTICS_EVENTS.MEMBER_PR_CONTRIBUTIONS_SHOWMORE, {
            contribution: exp
        })
        showMoreStatus(true)
    }

    const onShowLess = () => {
        analytics.captureEvent(APP_ANALYTICS_EVENTS.MEMBER_PR_CONTRIBUTIONS_SHOWLESS, {
            contribution: exp
        })
        showMoreStatus(false)
    }

    // Function to truncate HTML content without breaking tags
    const truncateHTML = (html, maxLength) => {
        const sanitizedHTML = sanitize(html); // Sanitize the HTML for security
        const clippedHtml = clip(sanitizedHTML, maxLength, { html: true, maxLines: 5 });
        return clippedHtml;
    };

    return <>
        {isBigDesc && <div>
            {!isShowMoreActive && <div className="text-[14px] leading-[24px] text-[#475569]">
                <div dangerouslySetInnerHTML={{ __html: truncateHTML(shortDesc, 250) }}></div>
                <span onClick={onShowMore} className="text-[#156FF7] italic cursor-pointer">Show More</span>
            </div>}
            {isShowMoreActive && <div className="text-[14px] leading-[24px] text-[#475569]">
                <div dangerouslySetInnerHTML={{ __html: fullDesc }}></div>
                <span onClick={onShowLess} className="text-[#156FF7] ml-[8px] italic cursor-pointer">Show Less</span>
            </div>}

        </div>}

        {!isBigDesc && <div dangerouslySetInnerHTML={{ __html: fullDesc }} className="text-[14px] leading-[24px] text-[#475569]"></div>}
    </>
}

export default MemberExperienceDescription