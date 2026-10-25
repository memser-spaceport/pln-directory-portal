export type McpOAuthClientInfoDto = {
  client_id: string;
  client_name: string;
  redirect_host: string | null;
  redirect_uri_registered: boolean;
};
