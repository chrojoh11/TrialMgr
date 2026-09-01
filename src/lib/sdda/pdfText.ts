/** Convert secretary-entered text to a single line supported by PDF standard fonts. */
export function toPdfStandardText(value: string | null | undefined, maxLength = 100) {
  return (value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}
