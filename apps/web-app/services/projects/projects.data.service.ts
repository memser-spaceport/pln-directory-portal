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
                formattedProject['maintainingTeamName'] = project.maintainingTeam?.name ?? '',
                formattedProject['maintainingTeamImage'] = project.maintainingTeam?.logo?.url ? project.maintainingTeam?.logo?.url : 'default',
                formattedProject['fundingNeeded'] = project.lookingForFunding ?? false;
                formattedArray.push(formattedProject);
            }
        });
        return formattedArray;
    } catch (err) {
        console.log(err);
    }
}

const formatToSave = (inputs, imageUid) => {

    // const userInfo = Cookies.get('userInfo') ? JSON.parse(Cookies.get('userInfo')) : null;
    const objectToSave = {
        // "uid": userInfo.uid,
        "name": inputs.name,
        "tagline": inputs.tagline,
        "description": inputs.desc,
        "contactEmail": inputs?.contactEmail,
        "lookingForFunding": inputs.fundsNeeded,
        "readMe": inputs.readme,
        "maintainingTeamUid": inputs?.maintainedBy?.value,
    }

    const tempCTeam = [];
    inputs?.contributingTeams?.map(team=>{
        const teamObj = {
            uid:team.value,
            name:team.label
        };
        tempCTeam.push(teamObj);
    });
    objectToSave['contributingTeams'] = tempCTeam;

    const tempKpi = [];
    inputs.KPIs.forEach(kpi => {
        const kpiObj = {};
        kpiObj['key'] = kpi.name;
        kpiObj['value'] = kpi.value;
        tempKpi.push(kpiObj);
    });
    objectToSave['kpis'] = tempKpi;

    if (imageUid) {
        objectToSave['logoUid'] = imageUid;
    }else if(inputs.logoURL){
        objectToSave['logoUid'] = inputs.logo.uid;
    }

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
            formattedProject['logo'] = project.logo ?? null;
            formattedProject['fundingNeeded'] = project.lookingForFunding ?? false;
            formattedProject['kpis'] = project.kpis ?? [];
            formattedProject['readMe'] = project.readMe ?? '';
            formattedProject['teamUid'] = project.maintainingTeamUid;
            formattedProject['maintainingTeam'] = project.maintainingTeam;
            formattedProject['isDeleted'] = project.isDeleted ?? false;
            
            const tempCTeams = [];
            project.contributingTeams.map(team=>{
                const teamObj = {};
                teamObj['value'] = team.uid;
                teamObj['label'] = team.name;
                teamObj['logo'] = team.logo?.url;
                tempCTeams.push(teamObj);
            });
            formattedProject['contributingTeams'] = tempCTeams;
            

            const tempProjectlinks = [];
            project.projectLinks?.map((link,index) => {
                const urlObj = {};
                urlObj['text'] = link.name;
                urlObj['url'] = link.url;
                urlObj['id'] = index;
                tempProjectlinks.push(urlObj);
            });
            formattedProject['projectLinks'] = tempProjectlinks;

            const tempKpi = [];
            project.kpis.forEach((kpi,index) => {
                const kpiObj = {};
                kpiObj['name'] = kpi.key;
                kpiObj['value'] = kpi.value;
                kpiObj['id'] = index;
                tempKpi.push(kpiObj);
            });
            formattedProject['KPIs'] = tempKpi;
            
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