import ProjectsDataService from "./projects.data.service";

const { getAllFormattedProjects } = ProjectsDataService;

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
        }
    ]
    try {
        const formattedData = getAllFormattedProjects(temp);
        return formattedData;
    } catch (err) {
        console.log(err);
    }
}
const ProjectsService = {
    getAll,
    getTeamsProject
}

export default ProjectsService;