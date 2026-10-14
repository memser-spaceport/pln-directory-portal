function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function wrapSpvSpotlightEmail(bodyHtml: string, subject: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f7fb;">
${bodyHtml}
</body>
</html>`;
}

function applyEmailConditionals(template: string, vars: Record<string, string>): string {
  return template.replace(
    /\{\{#if\s+([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\s*\/if\s*\}\}/g,
    (_match, key: string, inner: string) => {
      const elseMatch = inner.match(/\{\{\s*else\s*\}\}/);
      const whenTrue = elseMatch ? inner.slice(0, elseMatch.index) : inner;
      const whenFalse = elseMatch ? inner.slice((elseMatch.index ?? 0) + elseMatch[0].length) : '';
      return vars[key]?.trim() ? whenTrue : whenFalse;
    }
  );
}

export function mergeEmailTemplate(template: string, vars: Record<string, string>): string {
  return applyEmailConditionals(template, vars).replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|([^}]*))?\}\}/g,
    (_match, key: string, fallback?: string) => vars[key] || fallback?.trim() || ''
  );
}

export function emailTemplateTokens(template: string): { key: string; fallback: string }[] {
  const seen = new Map<string, string>();
  for (const match of template.matchAll(/\{\{#if\s+([a-zA-Z0-9_]+)\s*\}\}/g)) {
    if (!seen.has(match[1])) {
      seen.set(match[1], '');
    }
  }
  for (const match of template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|([^}]*))?\}\}/g)) {
    if (!seen.has(match[1])) {
      seen.set(match[1], (match[2] ?? '').trim());
    }
  }
  return [...seen.entries()].map(([key, fallback]) => ({ key, fallback }));
}
