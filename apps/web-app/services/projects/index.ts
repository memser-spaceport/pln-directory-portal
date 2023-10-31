import api from "apps/web-app/utils/api";
import ProjectsDataService from "./projects.data.service";

const { getAllFormattedProjects,formatToSave } = ProjectsDataService;

const getAll = () => {
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

    try {
        const formattedData = getAllFormattedProjects(temp);
        return formattedData;
    } catch (err) {
        console.log(err);
    }
}

const getTeamsProject = () => {
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
    const temp = []
    try {
        const formattedData = getAllFormattedProjects(temp);
        return formattedData;
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

const addProject = async (inputs,image) => {
    const data = formatToSave(inputs,image);
    const addedResponse = await api.post(`/v1/projects`, data);
    console.log(addedResponse);
    
}
const ProjectsService = {
    getAll,
    getTeamsProject,
    uploadProjectLogo,
    addProject
}

export default ProjectsService;