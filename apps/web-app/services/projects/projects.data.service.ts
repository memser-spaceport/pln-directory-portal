import Cookies from 'js-cookie';
/* eslint-disable @typescript-eslint/no-unused-expressions */
const getAllFormattedProjects = (data) => {
    try {
        const formattedArray = [];
        data.forEach(project => {
            if (project) {
                const formattedProject = {};
                formattedProject['id'] = project.uid ?? '';
                formattedProject['name'] = project.name ?? '';
                formattedProject['tagline'] = project.tagline ?? '';
                formattedProject['description'] = project.description ?? '';
                formattedProject['image'] = project.logo ? project.logo : '/assets/images/icons/projects/default.svg';
                formattedProject['contributingTeamName'] = project.contributingTeam?.name ?? '',
                    formattedProject['contributingTeamImage'] = project.contributingTeam?.image ? project.contributingTeam.image : 'default',
                    formattedProject['fundingNeeded'] = project.fundingNeeded ?? false;
                formattedArray.push(formattedProject);
            }
        });
        return formattedArray;
    } catch (err) {
        console.log(err);
    }
}

const formatToSave = (inputs, image) => {
    // const objectToSave = {
    //     logoURL: inputs.logoURL,
    //     name: inputs.name,
    //     tagline: inputs.tagline,
    //     desc: inputs.desc,
    //     projectURLs: inputs.projectURLs,
    //     contactEmail: inputs.contactEmail,
    //     fundsNeeded: inputs.fundsNeeded,
    //     KPIs: inputs.KPIs,
    //     readme: inputs.readme
    // }

    const userInfo = Cookies.get('userInfo') ? JSON.parse(Cookies.get('userInfo')) : null;
    const objectToSave = {
        // "uid": userInfo.uid,
        "logoUid": image ? image.uid : null,
        "name": inputs.name,
        "tagline": inputs.tagline,
        "description": inputs.desc,
        "contactEmail": 'nivedhapl@yopmail.com',
        "lookingForFunding": inputs.fundsNeeded,
        "kpis": [
            {
                "key": "key1",
                "value": "value2"
            }
        ],
        "readMe": inputs.readme,
        "teamUid": "uid-kunde---gleichner",
        "projectLinks": [
            {

                "name": "Link 3",
                "url": "https://link2.example.com1"

            },
            {

                "name": "Link 5",
                "url": "https://link1.example.com"

            }
        ]
    }
    return objectToSave;
}

const getFormattedProject = (project) => {
    try {
        const formattedProject = {};
        if (project) {
            formattedProject['id'] = project.uid ?? '';
            formattedProject['name'] = project.name ?? '';
            formattedProject['tagline'] = project.tagline ?? '';
            formattedProject['description'] = project.description ?? '';
            formattedProject['contactEmail'] = project.contactEmail ?? '';
            formattedProject['image'] = project.logo ? project.logo : '/assets/images/icons/projects/default.svg';
            formattedProject['fundingNeeded'] = project.lookingForFunding ?? false;
            formattedProject['projectLinks'] = project.projectLinks ?? [];
            formattedProject['kpis'] = project.kpis ?? [];
            formattedProject['readMe'] = project.readMe ?? '';
            formattedProject['teamUid'] = project.teamUid
        }
        return formattedProject;
    } catch (err) {
        console.log(err);
    }
}
const ProjectsDataService = {
    getAllFormattedProjects,
    formatToSave,
    getFormattedProject
}

export default ProjectsDataService;