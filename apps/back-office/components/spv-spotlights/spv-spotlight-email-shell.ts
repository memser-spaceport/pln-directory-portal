const LOGO_URL = 'https://pl-directory-images-dev.s3.us-west-1.amazonaws.com/protocol-labs-logo.png';

export function wrapSpvSpotlightEmail(bodyHtml: string, preferencesUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SPV Spotlight</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f7fb;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f7fb;">
<tr>
<td align="center" style="padding:32px 16px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background-color:#ffffff;">
<tr>
<td align="center" style="padding:24px 8px 16px;background-color:#ffffff;">
<img src="${LOGO_URL}" width="144" height="32" alt="Protocol Labs" style="display:block;border:0;height:32px;width:144px;">
</td>
</tr>
<tr>
<td style="background-color:#ffffff;">
${bodyHtml}
</td>
</tr>
<tr>
<td style="padding:0 24px;background-color:#ffffff;">
<div style="border-top:1px solid #e4e7ec;line-height:0;font-size:0;">&nbsp;</div>
</td>
</tr>
<tr>
<td align="center" style="padding:16px 24px 24px;background-color:#ffffff;font-family:Inter,Helvetica,Arial,sans-serif;font-size:12px;line-height:16px;letter-spacing:-0.2px;color:#8897ae;text-align:center;">
You received this email because you are a member of the Protocol Labs network.<br>
<a href="${preferencesUrl}" target="_blank" style="color:#8897ae;font-weight:500;text-decoration:underline;">Manage</a> your email preferences.
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

export function mergeEmailTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|([^}]*))?\}\}/g,
    (_match, key: string, fallback?: string) => vars[key] || fallback?.trim() || ''
  );
}

export function emailTemplateTokens(template: string): { key: string; fallback: string }[] {
  const seen = new Map<string, string>();
  for (const match of template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|([^}]*))?\}\}/g)) {
    if (!seen.has(match[1])) {
      seen.set(match[1], (match[2] ?? '').trim());
    }
  }
  return [...seen.entries()].map(([key, fallback]) => ({ key, fallback }));
}
