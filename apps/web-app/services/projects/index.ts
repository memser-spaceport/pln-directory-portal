import api from "apps/web-app/utils/api";
import ProjectsDataService from "./projects.data.service";
// import { getAllProjects } from '@protocol-labs-network/projects/data-access';

const { getAllFormattedProjects,formatToSave } = ProjectsDataService;

const getTeamsProject = async (uid) => {
    try {
        const response = await api.get(`/v1/projects?teamUid=${uid}`);
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
    if (inputs.logoURL) {
        const formData = new FormData();
        formData.append('file', inputs.logoURL);
        const config = {
            headers: {
                'content-type': 'multipart/form-data',
            },
        };
        const imageResponse = await api.post(`/v1/images`, formData, config);
        console.log(imageResponse.data.image);
        return imageResponse.data.image;
    }
}

const addProject = async (inputs,image,teamuid) => {
    const data = formatToSave(inputs,image,teamuid);
    const addedResponse = await api.post(`/v1/projects`, data);
    return addedResponse;
}

const updateProject = async (uid,project) => {
 const updateResponse = await api.put(`/v1/projects/${uid}`,project);
 return updateResponse;
}
const ProjectsService = {
    getTeamsProject,
    uploadProjectLogo,
    addProject,
    updateProject
}

export default ProjectsService;