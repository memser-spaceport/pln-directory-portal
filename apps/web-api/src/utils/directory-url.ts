export function directoryUrl(path: string): string {
  const base = (process.env.WEB_UI_BASE_URL ?? '').replace(/\/+$/, '');
  return `${base}${path}`;
}
