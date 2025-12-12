import * as yup from 'yup';

export const memberFormSchema = yup.object({
  accessLevel: yup
    .object({
      label: yup.string(),
      value: yup.string().required(),
    })
    .required('Access level is required'),
  image: yup.mixed<File>().nullable(),
  name: yup.string().required('Name is required'),
  email: yup.string().email('Must be a valid email').required('Email is required'),
  joinDate: yup.date().nullable().defined(),
  bio: yup.string().defined(),
  aboutYou: yup.string().defined(),
  country: yup.string().defined(),
  state: yup.string().defined(),
  city: yup.string().defined(),
  skills: yup.array().of(
    yup
      .object({
        label: yup.string().required(),
        value: yup.string().required(),
      })
      .required()
  ),
  teamOrProjectURL: yup.string().url('Must be a valid URL'),

  teamsAndRoles: yup.array().of(
    yup.object({
      team: yup
        .object({
          label: yup.string().required(),
          value: yup.string().required(),
        })
        .required('Required'),
      role: yup.string().required('Role is required'),
    })
  ),

  linkedin: yup.string().defined(),
  discord: yup.string().defined(),
  twitter: yup.string().defined(),
  github: yup.string().defined(),
  telegram: yup.string().defined(),
  officeHours: yup.string().defined(),
});
