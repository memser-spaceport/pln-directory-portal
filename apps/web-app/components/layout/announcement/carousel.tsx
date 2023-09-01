import { Carousel } from 'react-responsive-carousel';
import { ReactComponent as Share } from '../../../public/assets/images/icons/share.svg';
import { ReactComponent as Logo } from '../../../public/assets/images/icons/logo.svg';
import Link from 'next/link';
import { ANNOUNCEMENT_BANNER } from 'apps/web-app/constants';

export function CustomCarousel({ selectedItem, onChange, content, isMobile }) {

    const createMarkup = (pTag) => {
        return { __html: pTag };
    }

    return (
        <>
            {
                content && (
                    <Carousel selectedItem={selectedItem} autoPlay={true} showArrows={false} infiniteLoop={true} showIndicators={isMobile && content.length > 1} interval={4000}
                        className='relative' showStatus={false} showThumbs={false} swipeable={false}
                        onChange={onChange}
                    >
                        {
                            content.map((info, index) => {
                                return (
                                    <div className='relative ' key={index}>
                                        <div className={`relative text-white text-[14px] m-auto h-full p-2 flex flex-col md:flex-row justify-center ${isMobile && content.length === 1 ? 'pt-[30px]' : ''}`}>
                                            {
                                                !isMobile && (
                                                    <div>
                                                        <div className='inline-block px-2'>
                                                            <Logo />
                                                        </div>
                                                    </div>
                                                )
                                            }
                                            <div dangerouslySetInnerHTML={createMarkup(info?.infoHtml)}></div>
                                            <div className={`${isMobile?'py-4':''}`}>
                                            {
                                                info?.websiteLink && (
                                                    <div className='inline-block'>
                                                        <Link href={info.websiteLink}>
                                                            <a
                                                                className="px-2 border mx-4 rounded cursor-pointer block pt-[2px] pb-[1px] text-[13px] font-medium hover:bg-white hover:text-[#156FF7]"
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                {ANNOUNCEMENT_BANNER.VIEW_WEBSITE}
                                                            </a>
                                                        </Link>
                                                    </div>
                                                )
                                            }
                                            {
                                                info?.learnMoreLink && (
                                                    <div className='inline-block'>
                                                        <div className=' inline-block'>
                                                            <Link href={info.learnMoreLink}>
                                                                <a
                                                                    className="underline text-[13px] font-medium"
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                >
                                                                    {ANNOUNCEMENT_BANNER.LEARN_MORE}
                                                                </a>
                                                            </Link>
                                                        </div>
                                                        <div className='inline-block px-1 cursor-pointer'>
                                                            <Share />
                                                        </div>
                                                    </div>
                                                )
                                            }
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        }
                    </Carousel>
                )
            }
        </>
    );
}