import api from "../utils/api";

export const findProjectByName = async (searchTerm) => {
    const result = await api.get(`/v1/projects?name__istartswith=${searchTerm}`)
    return result.data;
}