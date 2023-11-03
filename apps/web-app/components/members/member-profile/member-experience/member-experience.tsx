import { useRouter } from "next/router";
import MemberExperienceDescription from "./member-experience-item";

function MemberExperience(props) {
    const experiences = props.experience ?? [];
    const router = useRouter();

    const formatDate = (dateString) => {
        const month = new Date(dateString).toLocaleDateString(undefined, {month: 'short'});
        const year = new Date(dateString).getFullYear();
        return `${month} ${year}`
    }
    const onEditOrAdd  = () => {
        router.push('/directory/settings')
    }
    return <>
        <div className="my-[20px]">
            <div className="text-[#64748B] text-[15px] font-[500] flex justify-between">
                <h3 className="text-[15px]">Experience</h3>
                {experiences.length > 0 && <button className="text-[#156FF7] text-[13px]" onClick={onEditOrAdd}>Edit/Add</button>}
            </div>
            <div className="mt-[8px] rounded-xl shadow-[0px_0px_2px_rgba(15,23,42,0.16),0px_2px_2px_rgba(15,23,42,0.04)] focus-within:outline-none focus:outline-none focus-visible:outline-none">
                <div>
                    {experiences.map((exp, expIndex) => <div key={`exp-${expIndex}`} className="border-[1px] border-solid border-[#E2E8F0] border-t-0 border-l-0 border-r-0 p-[16px]">
                        <div className="flex gap-[16px]">
                            <div>
                                <img className="w-[40px] h-[40px] object-contain" src={exp?.companyLogo?.url ? exp.companyLogo.url : '/assets/images/icons/company-logo-default.svg'} />
                            </div>
                            <div>
                                <p className="text-[14px] text-[#0F172A] font-[600]">{exp.title}</p>
                                <p className="text-[#475569] text-[12px] font-[400]">{exp.companyName}</p>
                                <div className="text-[#475569] text-[12px] font-[400] flex gap-[5px]">
                                    <p>{formatDate(exp.startDate)}</p>
                                    {exp.currentTeam && <p>{`- Present`}</p>}
                                    {(!exp.currentTeam && exp.endDate) && <p>{` - ${formatDate(exp.endDate)}`}</p>}
                                </div>
                            </div>
                        </div>
                        <div className="mt-[16px]">
                           <MemberExperienceDescription desc={exp.description}/>
                        </div>
                    </div>)}
                    {experiences.length === 0 && <p className="text-[#0F172A] font-[400] text-[12px] p-[16px]"><span onClick={onEditOrAdd} className="text-[#156FF7] cursor-pointer">Click here</span> to add your experience & contribution details.</p>}
                </div>



            </div>
        </div>
    </>
}

export default MemberExperience