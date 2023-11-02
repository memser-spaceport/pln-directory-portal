import Cookies from 'js-cookie';
import KPIs from '../../components/projects/details/kpis';
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
                formattedProject['image'] = project.logo?.url ? project.logo?.url : '/assets/images/icons/projects/default.svg';
                formattedProject['contributingTeamName'] = project.team?.name ?? '',
                formattedProject['contributingTeamImage'] = project.team?.logo?.url ? project.team?.logo?.url : 'default',
                formattedProject['fundingNeeded'] = project.lookingForFunding ?? false;
                formattedArray.push(formattedProject);
            }
        });
        return formattedArray;
    } catch (err) {
        console.log(err);
    }
}

const formatToSave = (inputs, image, teamuid) => {
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
        "contactEmail": userInfo?.email,
        "lookingForFunding": inputs.fundsNeeded,
        "readMe": inputs.readme,
        "teamUid": teamuid,
    }
    const tempKpi = [];
    inputs.KPIs.forEach(kpi => {
        const kpiObj = {};
        kpiObj['key'] = kpi.name;
        kpiObj['value'] = kpi.value;
        tempKpi.push(kpiObj);
    });
    objectToSave['kpis'] = tempKpi;

    const tempProjectlinks = [];
    inputs.projectURLs.forEach(urls => {
        const urlObj = {};
        urlObj['name'] = urls.text;
        urlObj['url'] = urls.url;
        tempProjectlinks.push(urlObj);
    });
    objectToSave['projectLinks'] = tempProjectlinks;

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
            formattedProject['image'] = project.logo?.url ? project.logo.url : '/assets/images/icons/projects/default.svg';
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