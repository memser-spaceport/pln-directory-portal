import { useRouter } from "next/router";
import MemberExperienceDescription from "./member-experience-item";
import { APP_ANALYTICS_EVENTS, SETTINGS_CONSTANTS } from "apps/web-app/constants";
import useAppAnalytics from "apps/web-app/hooks/shared/use-app-analytics";

function MemberExperience(props) {
    const member = props?.member;
    const isEditable = props.isEditable ?? false;
    const contributions = props.contributions ?? [];
    const isOwner = props.isOwner;
    const router = useRouter();
    const analytics = useAppAnalytics()

    const formatDate = (dateString) => {
        const month = new Date(dateString).toLocaleDateString(undefined, {month: 'short'});
        const year = new Date(dateString).getFullYear();
        return `${month} ${year}`
    }
    const onEditOrAdd  = () => {
        if(isOwner) {
          analytics.captureEvent(APP_ANALYTICS_EVENTS.MEMBER_PR_CONTRIBUTIONS_EDIT, {
            member: member,
          })
          router.push({pathname: '/settings', query: {tab: 'contributions'}}, '/settings')
        } else {
          const query = { id: member?.id, tab: 'contributions', name: member?.name, logo: member?.image, from: SETTINGS_CONSTANTS.MEMBER };
          router.push({
            pathname: '/settings',
            query
          }, '/settings');
        }
    }

    const onProjectClicked = (proj) => {
        /* if(proj && proj.uid) {
          router.push(`/projects/${proj.uid}`)
        } */
    }

    const dateDifference = (date1, date2) => {
        // Calculate the time difference in milliseconds
        const timeDifference = Math.abs(date1 - date2);

        // Helper function to calculate the number of full months between two dates
        const monthsBetween = (date1, date2) => {
          return (date2.getFullYear() - date1.getFullYear()) * 12 + date2.getMonth() - date1.getMonth();
        }

        // Calculate the difference in seconds, minutes, months, and years
        const secondsDifference = Math.floor(timeDifference / 1000);
        const minutesDifference = Math.floor(secondsDifference / 60);
        const hoursDifference = Math.floor(minutesDifference / 60);
        const daysDifference = Math.floor(hoursDifference / 24);
        const monthsDifference = monthsBetween(date1, date2);
        const yearsDifference = Math.floor(monthsDifference / 12);

        // Create a human-readable string based on the difference
        if (yearsDifference >= 1) {
          if (monthsDifference % 12 !== 0) {
            return `${yearsDifference} years and ${monthsDifference % 12} months`;
          } else if(yearsDifference === 1) {
            return `${yearsDifference} year`;
          } else {
            return `${yearsDifference} years`;
          }
        } else if (monthsDifference === 1) {
          return `${monthsDifference} month`;
        } else if (monthsDifference > 1) {
          return `${monthsDifference} months`;
        } else if (daysDifference === 1) {
          return `${daysDifference} day`;
        } else if (daysDifference > 1) {
          return `${daysDifference} days`;
        } else if (hoursDifference >= 1) {
          return `${hoursDifference} hours`;
        } else if (minutesDifference >= 1) {
          return `${minutesDifference} minutes`;
        } else {
          return `${secondsDifference} seconds`;
        }
      }



    return <>
        <div className="my-[20px]">
            <div className="text-[#64748B] text-[15px] font-[500] flex justify-between">
                <h3 className="text-[15px]">Project Contributions</h3>
                {(contributions.length > 0 && isEditable) && <button className="text-[#156FF7] text-[13px]" onClick={onEditOrAdd}>Edit/Add</button>}
            </div>
            <div className="mt-[8px] focus-within:outline-none focus:outline-none focus-visible:outline-none">
                <div>
                    {contributions.map((exp, expIndex) => <div key={`exp-${expIndex}`} className="mb-[10px] rounded-xl shadow-[0px_0px_2px_rgba(15,23,42,0.16),0px_2px_2px_rgba(15,23,42,0.04)]">
                        {!exp?.project?.isDeleted && <a target="_blank" href={`/projects/${exp?.project?.uid}`} onClick={() => onProjectClicked(exp?.project)} className="flex gap-[16px] cursor-pointer hover:bg-[#f7fbff] rounded-tl-xl rounded-tr-xl p-[16px] border-[1px] items-center border-solid border-[#E2E8F0] border-t-0 border-l-0 border-r-0" rel="noreferrer">
                            <div>
                                <img className="w-[70px] h-[70px] object-contain" src={exp?.project?.logo?.url ? exp.project?.logo?.url : '/assets/images/icons/projects/default.svg'} />
                            </div>
                            <div>
                                <p className="text-[14px] text-[#0F172A] font-[600] capitalize">{exp?.project?.name}</p>
                                <p className="text-[#475569] text-[12px] font-[400] capitalize">{exp?.role}</p>
                                <div className="text-[#475569] text-[12px] font-[400] flex gap-[5px]">
                                    <p>{formatDate(exp.startDate)}</p>
                                    {exp.currentProject && <p>{`- Present`}</p>}
                                    {(!exp.currentProject && exp.endDate) && <p>{` - ${formatDate(exp.endDate)}`}</p>}
                                    {exp.endDate && <p>{` (${dateDifference(new Date(exp.startDate), new Date(exp.endDate))})`}</p>}
                                    {!exp.endDate && <p>{` (${dateDifference(new Date(exp.startDate), new Date())})`}</p>}
                                </div>
                            </div>
                        </a>}
                        {exp?.project?.isDeleted && <div title="This project has been deleted" onClick={() => onProjectClicked(exp?.project)} className="flex gap-[16px] rounded-tl-xl rounded-tr-xl p-[16px] border-[1px] items-center border-solid border-[#E2E8F0] border-t-0 border-l-0 border-r-0">
                            <div>
                                <img className="w-[70px] h-[70px] object-contain" src={exp?.project?.logo?.url ? exp.project?.logo?.url : '/assets/images/icons/company-logo-default.svg'} />
                            </div>
                            <div>
                                <p className="text-[14px] text-[#0F172A] font-[600]">{exp?.project?.name}</p>
                                <p className="text-[#475569] text-[12px] font-[400]">{exp?.role}</p>
                                <div className="text-[#475569] text-[12px] font-[400] flex gap-[5px]">
                                    <p>{formatDate(exp.startDate)}</p>
                                    {exp.currentProject && <p>{`- Present`}</p>}
                                    {(!exp.currentProject && exp.endDate) && <p>{` - ${formatDate(exp.endDate)}`}</p>}
                                    {exp.endDate && <p>{` (${dateDifference(new Date(exp.startDate), new Date(exp.endDate))})`}</p>}
                                    {!exp.endDate && <p>{` (${dateDifference(new Date(exp.startDate), new Date())})`}</p>}
                                </div>
                            </div>
                        </div>}
                        {exp?.description !== '' && <div className="p-[16px]">
                           <MemberExperienceDescription exp={exp} desc={exp.description}/>
                        </div>}
                    </div>)}
                </div>



            </div>
        </div>
    </>
}

export default MemberExperience