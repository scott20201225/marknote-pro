// __MARKNOTEPRO_ONLY__

const MARKDOWN_EXTENSIONS = Object.freeze([
  'markdown',
  'mdown',
  'mkdn',
  'md',
  'mkd',
  'mdwn',
  'mdtxt',
  'mdtext',
  'mdx',
  'text',
  'txt'
])

/**
 * Returns true if the filename matches one of the markdown extensions allowed in MarkNotePro.
 *
 * @param {string} filename Path or filename
 */
export const hasMarkdownExtension = filename => {
  if (!filename || typeof filename !== 'string') return false
  return MARKDOWN_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(`.${ext}`))
}
