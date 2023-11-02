function MemberExperience(props) {
    const experiences = [{
        companyName: 'Microsoft',
        companyLogo: { url: '/google.png' },
        startDate: new Date(2023, 3),
        endDate: new Date(2023, 5),
        description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea',
        title: 'Sr Technical Manager'
    }]
    return <>
        <div className="my-[20px]">
            <h1 className="text-[#64748B] text-[15px] font-[500]">Experience</h1>
            <div className="p-[16px] mt-[8px] rounded-xl shadow-[0px_0px_2px_rgba(15,23,42,0.16),0px_2px_2px_rgba(15,23,42,0.04)] focus-within:outline-none focus:outline-none focus-visible:outline-none">
                <div>
                    {experiences.map((exp, expIndex) => <div key={`exp-${expIndex}`} className="">
                        <div className="flex gap-[16px]">
                            <div>
                                <img src={exp.companyLogo} />
                            </div>
                            <div>
                                <p>{exp.title}</p>
                                <p>{exp.companyName}</p>
                                <p>Date</p>
                            </div>
                        </div>
                        <div>
                            {exp.description}
                        </div>
                    </div>)}
                </div>



            </div>
        </div>
    </>
}

export default MemberExperience