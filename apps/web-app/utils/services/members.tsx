import axios from 'axios';
import { ENROLLMENT_TYPE } from '../../constants';
import api from '../api';

export const fetchMember = async (id) => {
  try {
    const response = await api.get(`/v1/members/${id}`);
    if (response.data) {
      return response.data;
    }
  } catch (error) {
    console.error(error);
  }
};

export const requestPendingCheck = async (email, id) => {
  try {
    const data = {
      uniqueIdentifier: email,
      participantType: ENROLLMENT_TYPE.MEMBER,
      uid: id,
    };

    const response = await api.post(
      `/v1/participants-request/unique-identifier`,
      data
    );
    if (response.data) {
      return response.data;
    }
  } catch (error) {
    console.error(error);
  }
};

export const getAllPinned = async (userName) => {
  const key = process.env.NEXT_PUBLIC_GITHUB_API_KEY;
  return await axios
    .post(
      'https://api.github.com/graphql',
      {
        query: `{
          user(login: "${userName}") {
            pinnedItems(first: 10, types: REPOSITORY) {
              nodes {
                ... on RepositoryInfo {
                  name
                  description
                  url
                  createdAt
                  updatedAt
                }
              }
            }
          }
        }`,
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
      }
    )
    .then((v) => v.data.data.user?.pinnedItems?.nodes)
    .catch((e) => console.log(e));
};

export const getAllRepositories = async (userName) => {
  return await axios
    .get(`https://api.github.com/users/${userName}/repos`)
    .then((v) => {
      const repoArray = v.data.map((item) => {
        return {
          name: item.name,
          description: item.description,
          url: item.html_url,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        };
      });
      return repoArray;
    })
    .catch((e) => console.log(e.message));
};
