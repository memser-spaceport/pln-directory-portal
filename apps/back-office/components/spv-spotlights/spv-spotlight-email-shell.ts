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

function hasTemplateValue(vars: Record<string, string>, key: string): boolean {
  return Boolean(vars[key]?.trim());
}

function chooseEmailBranch(ifKey: string, inner: string, vars: Record<string, string>): string {
  const parts: { key: string | null; body: string }[] = [];
  const marker = /\{\{\s*else(?:\s+if\s+([a-zA-Z0-9_]+))?\s*\}\}/g;
  let lastIndex = 0;
  let key: string | null = ifKey;
  for (const match of inner.matchAll(marker)) {
    const at = match.index ?? 0;
    parts.push({ key, body: inner.slice(lastIndex, at) });
    key = match[1] ?? null;
    lastIndex = at + match[0].length;
    if (key === null) {
      break;
    }
  }
  parts.push({ key, body: inner.slice(lastIndex) });
  for (const part of parts) {
    if (part.key === null || hasTemplateValue(vars, part.key)) {
      return part.body;
    }
  }
  return '';
}

function applyEmailConditionals(template: string, vars: Record<string, string>): string {
  return template.replace(
    /\{\{#if\s+([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\s*\/if\s*\}\}/g,
    (_match, key: string, inner: string) => chooseEmailBranch(key, inner, vars)
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
  for (const match of template.matchAll(/\{\{\s*else\s+if\s+([a-zA-Z0-9_]+)\s*\}\}/g)) {
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
