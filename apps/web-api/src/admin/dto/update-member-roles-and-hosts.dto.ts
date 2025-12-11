export class UpdateMemberRolesAndHostsDto {
  /**
   * List of role names for this member (e.g. ["DEMO_DAY_ADMIN", "DIRECTORY_ADMIN"]).
   * The service will replace the whole set of roles with this list.
   * Optional - if not provided, roles will not be updated.
   */
  roles?: string[];

  /**
   * List of demo day hosts for this member (e.g. ["plnetwork.io", "founders.plnetwork.io"]).
   * The service will replace the whole set of HOST scopes with this list.
   * Optional - if not provided, hosts will not be updated.
   */
  hosts?: string[];
}
