import { ReactComponent as PreviousArrow } from '../../../public/assets/images/icons/previous_arrow.svg';
import { ReactComponent as NextArrow } from '../../../public/assets/images/icons/next_arrow.svg';
import { ReactComponent as CloseIcon } from '../../../public/assets/images/icons/closeIcon.svg';
import { ReactComponent as Logo } from '../../../public/assets/images/icons/logo.svg';
import { useEffect, useState } from "react";
import { CustomCarousel } from './carousel';

export function AnnouncementBanner({ content, showBanner, setBannerState }) {

    const [selectedItem, setSelectedItem] = useState(0);

    const [isMobile, setIsMobileFlag] = useState(false);

    useEffect(() => {
        setIsMobileFlag(window.innerWidth <= 640);
        if (typeof window !== 'undefined') {
            window.addEventListener("resize", () => {
                setIsMobileFlag(window.innerWidth <= 640);
            });
        }
    },[])

    const next = () => {
        setSelectedItem(selectedItem + 1);
    };

    const prev = () => {
        setSelectedItem(selectedItem - 1);
    };

    const updateCurrentSlide = (index) => {
        setSelectedItem(index);
    };

    return (
        <>
            {
                showBanner && (
                    <div className="  banner-gradiant bg-cover bg-center bg-no-repeat flex justify-between top-0 sticky z-[999]">
                        {
                            !isMobile && (
                                <div className="inline-block pt-2 min-w-[124px]">
                                    {
                                        content.length > 1 && (
                                            <>
                                                <div className="inline-block px-4 text-[14px] cursor-pointer" onClick={prev}>
                                                    <PreviousArrow />
                                                </div>
                                                <div className="inline-block text-white text-[14px]">
                                                    {selectedItem + 1} of {content.length}
                                                </div>
                                                <div className="inline-block px-4 text-[14px] cursor-pointer" onClick={next}>
                                                    <NextArrow />
                                                </div>
                                            </>
                                        )
                                    }
                                    
                                </div>
                            )
                        }
                        {
                            isMobile && (
                                <div>
                                    <div className='inline-block px-2 py-2'>
                                        <Logo />
                                    </div>
                                </div>
                            )
                        }
                        <div className="w-4/6">
                            <CustomCarousel selectedItem={selectedItem} onChange={updateCurrentSlide} content={content} isMobile={isMobile} />
                        </div>
                        <div className="px-6 py-2 inline-block ">
                            <CloseIcon
                                className="cursor-pointer"
                                onClick={() => setBannerState(false)}
                            />
                        </div>
                    </div>
                )
            }
        </>
    );
}