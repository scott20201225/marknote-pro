export function localPathToFileUrl(src: string): string {
  const normalized = src.replace(/\\/g, '/');

  if (/^\/\/[^/]+\/[^/]+/.test(normalized))
    return `file://${normalized.slice(2)}`;

  if (/^[a-z]:\//i.test(normalized))
    return `file:///${normalized}`;

  return `file://${normalized}`;
}

// The document directory is a raw filesystem path. Image and link paths are
// already URL-form, so only the directory needs URL delimiter escaping.
export function encodeDirnameForUrl(dirname: string): string {
  return dirname.replace(/%/g, '%25').replace(/\?/g, '%3F').replace(/#/g, '%23');
}
