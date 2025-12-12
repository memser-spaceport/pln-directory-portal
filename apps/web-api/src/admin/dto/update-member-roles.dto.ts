

export class UpdateMemberRolesDto {
  /**
   * List of role names for this member (e.g. ["DEMO_DAY_ADMIN", "DIRECTORY_ADMIN"]).
   * The service will replace the whole set of roles with this list.
   */
  roles: string[];
}
