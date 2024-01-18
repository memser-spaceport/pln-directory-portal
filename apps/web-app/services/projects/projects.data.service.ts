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
        // "maintainingTeamUid": inputs?.maintainedBy?.value,
        "maintainingTeamUid": inputs?.maintainedBy?.uid,
    }

    if(inputs?.contactEmail){
        objectToSave['contactEmail'] = inputs?.contactEmail;
    }else{
        objectToSave['contactEmail'] = null;
    }

    // const tempCTeam = [];
    // inputs?.contributingTeams?.map(team=>{
    //     const teamObj = {
    //         uid:team.value,
    //         name:team.label
    //     };
    //     tempCTeam.push(teamObj);
    // });
    // objectToSave['contributingTeams'] = tempCTeam;

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

    let tempCTeam = [];
    const tempContributors = [];

    // inputs.maintainedByContributors?.forEach(contributor => {
    //     const contriObj = {
    //         "type": "MAINTENER",
    //         "teamUid": inputs?.maintainedBy?.uid,
    //         "memberUid": contributor.uid
    //      };
    //      if(contributor.cuid){
    //         contriObj['uid'] = contributor.cuid;
    //     }
    //     if(contributor.isDeleted){
    //         contriObj['isDeleted'] = contributor.isDeleted;
    //     }
    //      tempContributors.push(contriObj);
    // });

    // inputs.collabTeamsList?.forEach(collabContributor => {
    //     const teamObj = {
    //         uid:collabContributor?.team?.uid,
    //         name:collabContributor?.team?.name
    //     };
    //     tempCTeam.push(teamObj);
    //     collabContributor?.members?.forEach(mem => {
    //          const contriObj = {
    //              "type": "COLLABORATOR",
    //              "teamUid": collabContributor?.team?.uid,
    //              // "memberUid": collabContributor.uid
    //           };
    //         contriObj['memberUid'] = mem.uid;
    //         if(mem.cuid){
    //             contriObj['uid'] = mem.cuid;
    //         }
    //         if(mem.isDeleted){
    //             contriObj['isDeleted'] = mem.isDeleted;
    //         }
    //         tempContributors.push(contriObj);
    //      });
    // });

    // tempContributors = inputs.contributors?.map(member=>{
    //     if(!member?.isDeleted){
    //         return {
    //             "memberUid":member.uid
    //         }
    //     }
    // });

    inputs.contributors?.forEach((element) => {
      const tempContri = {};
      if (!element?.isDeleted) {
        tempContri['memberUid'] = element.uid;
        if (element?.cuid) {
          tempContri['uid'] = element.cuid;
        }
        tempContributors.push(tempContri);
      } else {
          if (element?.cuid) {
            tempContri['memberUid'] = element.uid;
          tempContri['uid'] = element.cuid;
          tempContri['isDeleted'] = element?.isDeleted
            ? element?.isDeleted
            : false;
            tempContributors.push(tempContri);
        }
      }
    });

    tempCTeam = inputs.contributingTeams?.map((team) => {
      return {
        uid: team?.uid,
        name: team?.name,
      };
    });
    
    objectToSave['contributingTeams'] = tempCTeam;
    objectToSave['contributors'] = tempContributors;
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
            // formattedProject['contributors'] = project.contributors ?? null;
            formattedProject['createdBy'] = project.createdBy ?? null;

            
            const tempContributors = [];
            project.contributors?.map((mem)=>{
                const memberObj = {};
                memberObj['logo'] = mem?.member?.image ? mem?.member?.image?.url : null;
                const mainTeam = mem?.member?.teamMemberRoles?.filter(teamRoles=>{
                    return teamRoles?.mainTeam === true;
                });
                memberObj['mainTeam'] = mainTeam && mainTeam.length > 0 ? mainTeam[0] : null;
                memberObj['name'] = mem?.member?.name;
                const teamLead = mem?.member?.teamMemberRoles.some((team) => team.teamLead);
                memberObj['teamLead'] =  teamLead,
                memberObj['teamMemberRoles'] = mem?.member?.teamMemberRoles;
                memberObj['uid'] = mem?.member?.uid,
                memberObj['cuid'] = mem?.uid;
                tempContributors.push(memberObj);
            });
            formattedProject['contributors'] = tempContributors;

            const tempCTeams = [];
            project.contributingTeams.map(team=>{
                const teamObj = {};
                teamObj['uid'] = team.uid;
                teamObj['name'] = team.name;
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