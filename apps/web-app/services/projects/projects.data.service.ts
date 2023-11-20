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
        // "contactEmail": inputs?.contactEmail,
        "lookingForFunding": inputs.fundsNeeded,
        "readMe": inputs.readme,
        "maintainingTeamUid": inputs?.maintainedBy?.value,
    }

    if(inputs?.contactEmail){
        objectToSave['contactEmail'] = inputs?.contactEmail;
    }else{
        objectToSave['contactEmail'] = null;
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
        if(kpi.name){
            kpiObj['key'] = kpi.name;
        }
        if(kpi.value){
            kpiObj['value'] = kpi.value;
        }
        if(Object.keys(kpiObj).length){
            tempKpi.push(kpiObj);
        }
    });
    objectToSave['kpis'] = tempKpi;

    if (imageUid) {
        objectToSave['logoUid'] = imageUid;
    }else if(inputs.logoURL && inputs.logo){
        objectToSave['logoUid'] = inputs.logo.uid;
    }else{
        objectToSave['logoUid'] = null;
    }

    const tempProjectlinks = [];
    inputs.projectURLs.forEach(urls => {
        const urlObj = {};
        if(urls.text){
            urlObj['name'] = urls.text;
        }
        if(urls.url){
            urlObj['url'] = urls.url;
        }
        if(Object.keys(urlObj).length){
            tempProjectlinks.push(urlObj);
        }
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
                teamObj['logo'] = team.logo ? team.logo.url : null;
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