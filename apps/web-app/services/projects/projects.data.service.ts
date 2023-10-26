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
const ProjectsDataService = {
    getAllFormattedProjects
}

export default ProjectsDataService;