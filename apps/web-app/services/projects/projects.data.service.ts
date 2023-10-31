/* eslint-disable @typescript-eslint/no-unused-expressions */
const getAllFormattedProjects = (data) => {
    try {
        const formattedArray = [];
        data.forEach(project => {
            if (project) {
                const formattedProject = {};
                formattedProject['id'] = project.id ?? '';
                formattedProject['name'] = project.name ?? '';
                formattedProject['description'] = project.description ?? '';
                formattedProject['image'] = project.image ? project.image : '/assets/images/icons/projects/default.svg';
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

const formatToSave = (inputs) => {
    const objectToSave = {
        logoURL: inputs.logoURL,
        name: inputs.name,
        tagline: inputs.tagline,
        desc: inputs.desc,
        projectURLs: inputs.projectURLs,
        contactEmail: inputs.contactEmail,
        fundsNeeded: inputs.fundsNeeded,
        KPIs: inputs.KPIs,
        readme: inputs.readme
    }
    return objectToSave;
}
const ProjectsDataService = {
    getAllFormattedProjects
}

export default ProjectsDataService;