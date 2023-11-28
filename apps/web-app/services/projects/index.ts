import api from "apps/web-app/utils/api";
import ProjectsDataService from "./projects.data.service";
// import { getAllProjects } from '@protocol-labs-network/projects/data-access';

const { getAllFormattedProjects,formatToSave } = ProjectsDataService;

const getTeamsProject = async (uid) => {
    try {
        const response = await api.get(`/v1/projects?maintainingTeamUid=${uid}`);
        if (response.status === 200) {

            const formattedData = getAllFormattedProjects(response.data);
            return formattedData;
        } else {
            return null;
        }
    } catch (err) {
        console.log(err);
    }
}

const uploadProjectLogo = async (inputs) => {
    if (inputs.logoObject) {
        const formData = new FormData();
        formData.append('file', inputs.logoObject);
        const config = {
            headers: {
                'content-type': 'multipart/form-data',
            },
        };
        const imageResponse = await api.post(`/v1/images`, formData, config);
        return imageResponse.data.image;
    }else{
        return null;
    }
}

const addProject = async (inputs,image) => {
    const data = formatToSave(inputs,image?.uid);
    const addedResponse = await api.post(`/v1/projects`, data);
    return addedResponse;
}

const updateProjectDetails = async (inputs, image, uid) => {
    const data = formatToSave(inputs, image?.uid);
    const addedResponse = await api.put(`/v1/projects/${uid}`, data);
    return addedResponse;
}

const updateProject = async (uid,project) => {
    const {readMe} = project;
 const updateResponse = await api.put(`/v1/projects/${uid}`,{readMe});
 return updateResponse;
}

const deleteProject = async (uid) => {
    const delResponse = await api.delete(`/v1/projects/${uid}`);
    return delResponse;
}

const fetchTeams = async () => {
    try {
        const response = await api.get(`/v1/teams?select=uid,name,shortDescription,logo.url&&pagination=false&&with=teamMemberRoles`);
        if (response.data) {
            return response.data.map((team)=>{
                return {
                    uid:team.uid,
                    name:team.name,
                    logo: team.logo?.url ? team.logo.url : null,
                    // logo:null
                }
            });
        }
    } catch (error) {
        console.error(error);
    }
};

const fetchMembers = async (teamId) => {
    try {
        const response = await api.get(`/v1/members?teamMemberRoles.team.uid=${teamId}&&select=uid,name,image.url,teamMemberRoles&&pagination=false`);
        if (response.data) {
            return response.data.map((member)=>{
                return {
                    uid:member.uid,
                    name:member.name,
                    logo: member.image?.url ? member.image.url : null,
                    // logo:null
                }
            });
        }
    } catch (error) {
        console.error(error);
    }
};
const ProjectsService = {
    getTeamsProject,
    uploadProjectLogo,
    addProject,
    updateProject,
    updateProjectDetails,
    deleteProject,
    fetchTeams,
    fetchMembers
}

export default ProjectsService;