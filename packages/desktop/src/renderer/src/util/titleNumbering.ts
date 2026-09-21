export interface NumberedHeadingItem {
  lvl: number | null
  content?: unknown
  [key: string]: unknown
}

export interface HeadingNumberingOptions {
  includeTopLevel?: boolean
}

/**
 * Calculates heading numbers relative to the highest-level heading anywhere in
 * the document, rather than the first heading encountered. By default, that
 * heading is treated as the document title and numbering starts one level
 * below it. Set includeTopLevel to number the document title as well. Missing
 * parent levels are treated as 1 so a document never produces 0.x.
 */
export const computeHeadingNumbers = (
  levels: readonly (number | null)[],
  { includeTopLevel = false }: HeadingNumberingOptions = {}
): string[] => {
  const validLevels = levels.filter(
    (level): level is number => level != null && level >= 1 && level <= 6
  )
  if (validLevels.length === 0) return []

  const highestLevel = Math.min(...validLevels)
  const baseLevel = highestLevel + (includeTopLevel ? 0 : 1)
  const counters: number[] = []

  return levels.map((level) => {
    if (level == null || level < 1 || level > 6) return ''
    if (level < baseLevel) return ''

    const depth = level - baseLevel + 1
    while (counters.length < depth) counters.push(0)

    for (let index = 0; index < depth - 1; index += 1) {
      if (counters[index] === 0) counters[index] = 1
    }

    counters[depth - 1] += 1
    counters.length = depth
    const number = counters.join('.')
    return depth === 1 ? `${number}.` : number
  })
}

export const addHeadingNumbersToToc = <T extends NumberedHeadingItem>(
  toc: readonly T[],
  enabled: boolean,
  options: HeadingNumberingOptions = {}
): T[] => {
  if (!enabled || toc.length === 0) return toc.map((item) => ({ ...item }))

  const numbers = computeHeadingNumbers(toc.map((item) => item.lvl), options)
  return toc.map((item, index) => {
    const content = typeof item.content === 'string' ? item.content : ''
    const number = numbers[index]
    return {
      ...item,
      content: number ? `${number} ${content}` : content
    }
  })
}
