import { BTN_LABEL_CONSTANTS, NW_SPOTLIGHT_CONSTANTS } from "apps/web-app/constants";
import Image from 'next/image';
import { PortalButton } from "../../portal-button/portal-button";
import { ReactComponent as PlayButton } from 'apps/web-app/public/assets/images/icons/play.svg';
import { YoutubeVideoPlayer } from "apps/web-app/components/shared/directory/video/video-viewer-popup";
import { useState } from "react";


export const NetworkSpotlight = ({ videoDetails, playlistDetails }) => {
    const [showPopupFlag, setShowPopupFlag] = useState<boolean>(false);

    const handleClosePopup = () => {
        setShowPopupFlag(false);
    }

    const openYoutubeVideo = () => {
        setShowPopupFlag(true);
    }

    const openBlogPage = () => {
        window.open(NW_SPOTLIGHT_CONSTANTS.BLOG_URL, '_blank');
    }

    const openPlaylist = () => {
        window.open(NW_SPOTLIGHT_CONSTANTS.YOUTUBE_PLAYLIST, '_blank')
    }
    return (
        <>
            <section className="border p-[24px] rounded-lg bg-white mt-16 ">
                <p className="font-extrabold text-[24px] leading-[28px] pb-6 text-left">{NW_SPOTLIGHT_CONSTANTS.HEADING}</p>
                <div className="flex flex-col md:flex-row justify-between gap-[16px]">
                    <div className="w-[360px] h-[328px] border rounded-[8px] bg-[#F1F5F9] p-[20px]">
                        <div>
                            <div className="absolute rounded-full w-[45px] h-[20px] mt-[8px] text-[12px] font-medium bg-[#156FF7] ml-[8px] z-[1001]">
                                <span className="relative p-[5px] text-[#FFFFFF]">{NW_SPOTLIGHT_CONSTANTS.BLOG}</span>
                            </div>
                            <Image
                                width="300"
                                height="160"
                                src="/assets/images/web3-trends.jpg"
                                alt="Directory Illustration"
                                quality={100}
                                className="rounded-lg cursor-pointer"
                                onClick={openBlogPage}
                            />
                            <p className="text-[16px] font-semibold leading-6 text-[#0F172A] text-left">{NW_SPOTLIGHT_CONSTANTS.BLOG_TITLE}</p>
                            <div className="pt-8 text-left">
                                <PortalButton
                                    url={NW_SPOTLIGHT_CONSTANTS.BLOG_URL}
                                    label={BTN_LABEL_CONSTANTS.READ_ARTICLE}
                                />
                            </div>
                        </div>
                    </div>
                    {
                        (videoDetails && <div className="w-[360px] h-[328px] border rounded-[8px] bg-[#F1F5F9] p-[20px]">

                            <div className="flex flex-col">
                                <div className="relative w-[300px] h-[168px]">
                                    <div className="absolute rounded-full w-[45px] h-[20px] mt-[8px] text-[12px] font-medium bg-[#156FF7] ml-[8px] z-[1001]">
                                        <span className="relative p-[5px] text-[#FFFFFF]">{NW_SPOTLIGHT_CONSTANTS.VIDEO}</span>
                                    </div>
                                    <div className="absolute w-full h-[160px] z-[1000] bg-[#0F172A] opacity-20 rounded-lg">
                                    </div>
                                    <div className="absolute w-full h-[160px] z-[1002] cursor-pointer" onClick={openYoutubeVideo}>
                                        <PlayButton className="left-[120px] top-[50px] relative" />
                                    </div>
                                    <Image
                                        width="300"
                                        height="160"
                                        src={videoDetails['items'][0].snippet.thumbnails.medium.url}
                                        alt="Directory Illustration"
                                        quality={100}
                                        className="rounded-lg"
                                    />
                                </div>
                                <div>
                                    <p className="text-[16px] font-semibold leading-6 text-[#0F172A] youtube-title text-left">{videoDetails['items'][0].snippet.title}</p>
                                </div>
                                <div>
                                    <div className="pt-5 text-left">
                                        <button
                                            className="focus:pln-shadow-01--focus text-left pln-shadow-01 rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-900 hover:border-slate-400 focus:border-blue-600"
                                            onClick={openYoutubeVideo}
                                        >
                                            {BTN_LABEL_CONSTANTS.PLAY_VIDEO}
                                        </button>
                                    </div>
                                </div>
                            </div>

                        </div>)
                    }
                    {
                        (playlistDetails && <div className="w-[360px] h-[328px] border rounded-[8px] bg-[#F1F5F9] p-[20px]">
                            <div>
                                <div className="absolute rounded-full w-[45px] h-[20px] mt-[8px] text-[12px] font-medium bg-[#156FF7] ml-[8px] z-[1001]">
                                    <span className="relative p-[5px] text-[#FFFFFF]">{NW_SPOTLIGHT_CONSTANTS.SERIES}</span>
                                </div>
                                <Image
                                    width="300"
                                    height="160"
                                    src={playlistDetails['items'][0].snippet.thumbnails.medium.url}
                                    alt="Directory Illustration"
                                    quality={100}
                                    className="rounded-lg cursor-pointer"
                                    onClick={openPlaylist}
                                />
                                <p className="text-[16px] font-semibold leading-6 text-[#0F172A] text-left">{playlistDetails['items'][0].snippet.title}</p>
                                <div className="pt-14 text-left">
                                    <PortalButton
                                        url={NW_SPOTLIGHT_CONSTANTS.YOUTUBE_PLAYLIST}
                                        label={BTN_LABEL_CONSTANTS.VIEW_PLAYLIST}
                                    />
                                </div>
                            </div>
                        </div>)
                    }
                </div>
            </section>
            <YoutubeVideoPlayer isOpen={showPopupFlag} handleClose={handleClosePopup} />
        </>
    )
}