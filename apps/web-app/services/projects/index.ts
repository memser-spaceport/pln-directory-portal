import api from "apps/web-app/utils/api";
import ProjectsDataService from "./projects.data.service";
// import { getAllProjects } from '@protocol-labs-network/projects/data-access';

const { getAllFormattedProjects,formatToSave } = ProjectsDataService;

const getAll = async (params) => {
    const temp = [
        {
            id:1,
            name: 'Senuto',
            description: 'Project Tag line will be shown here upto 80 characters',
            image: '',
            contributingTeam: {
                name: 'Socyall Connect',
                image: ''
            },
            fundingNeeded: true
        },
        {
            id:2,
            name: 'ABC',
            description: 'Project Tag line will be shown here upto 80 characters',
            image: '',
            contributingTeam: {
                name: 'ABC Connect',
                image: ''
            },
            fundingNeeded: true
        },
        {
            id:3,
            name: 'XYZ',
            description: 'Project Tag line will be shown here upto 80 characters',
            image: '',
            contributingTeam: {
                name: 'XYZ Connect',
                image: ''
            },
            fundingNeeded: false
        },
        {
            id:4,
            name: 'Senuto',
            description: 'Project Tag line will be shown here upto 80 characters',
            image: '',
            contributingTeam: {
                name: 'Socyall Connect',
                image: ''
            },
            fundingNeeded: true
        }
    ]
    // try {
    //     const allProjects = await getAllProjects(params);
    //     // const allProjects = await api.get('/v1/projects')
    //     console.log(allProjects);
    //     if(allProjects.status === 200){
    //         const formattedData = getAllFormattedProjects(allProjects.body);
    //         return formattedData;   
    //     }
    //     return null;
    // } catch (err) {
    //     console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>.',err);
    // }
}

const getTeamsProject = async (uid) => {
    // const temp = [
    //     {
    //         id:1,
    //         name: 'Senuto',
    //         description: 'Project Tag line will be shown here upto 80 characters',
    //         image: '',
    //         contributingTeam: {
    //             name: 'Socyall Connect',
    //             image: ''
    //         },
    //         fundingNeeded: true
    //     },
    //     {
    //         id:2,
    //         name: 'ABC',
    //         description: 'Project Tag line will be shown here upto 80 characters',
    //         image: '',
    //         contributingTeam: {
    //             name: 'ABC Connect',
    //             image: ''
    //         },
    //         fundingNeeded: true
    //     },
    //     {
    //         id:3,
    //         name: 'XYZ',
    //         description: 'Project Tag line will be shown here upto 80 characters',
    //         image: '',
    //         contributingTeam: {
    //             name: 'XYZ Connect',
    //             image: ''
    //         },
    //         fundingNeeded: false
    //     },
    //     {
    //         id:4,
    //         name: 'Senuto',
    //         description: 'Project Tag line will be shown here upto 80 characters',
    //         image: '/assets/images/icons/projects/default.svg',
    //         contributingTeam: {
    //             name: 'Socyall Connect',
    //             image: '/assets/images/icons/projects/default.svg'
    //         },
    //         fundingNeeded: true
    //     }
    // ]
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
    // if (values.imageFile) {
    //     const formData = new FormData();
    //     formData.append('file', values.imageFile);
    //     const config = {
    //       headers: {
    //         'content-type': 'multipart/form-data',
    //       },
    //     };
    //     const imageResponse = await api.post(`/v1/images`, formData, config);
    //     image = imageResponse?.data?.image;
    //   }
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