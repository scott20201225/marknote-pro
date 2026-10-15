import type { Position } from 'codemirror'
import { useEditorStore } from '@/store/editor'

export interface SearchOptions {
  isCaseSensitive?: boolean
  isWholeWord?: boolean
  isRegexp?: boolean
  selectHighlight?: boolean
}

export interface ReplaceOptions extends SearchOptions {
  isSingle?: boolean
}

export interface SearchMatch {
  from: Position
  to: Position
  match: string
  rawMatch?: RegExpExecArray | null
}

const escapeRegExp = (str: string): string =>
  str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const buildSearchRegex = (query: string, opt: SearchOptions = {}): RegExp | null => {
  if (!query) return null
  const flags = opt.isCaseSensitive ? 'g' : 'gi'

  if (opt.isRegexp) {
    try {
      return new RegExp(query, flags)
    } catch {
      return null
    }
  }

  let pattern = escapeRegExp(query)
  if (opt.isWholeWord) {
    pattern = `\\b${pattern}\\b`
  }
  return new RegExp(pattern, flags)
}

export class CodeMirrorSearchManager {
  private cm: any
  private markers: any[] = []
  private activeMarker: any = null
  private matches: SearchMatch[] = []
  private currentIndex: number = -1
  private lastQuery: string = ''
  private lastOptions: SearchOptions = {}
  private editorStore: ReturnType<typeof useEditorStore>

  constructor(cm: any, editorStore?: ReturnType<typeof useEditorStore>) {
    this.cm = cm
    this.editorStore = editorStore || useEditorStore()
  }

  public setEditor(cm: any): void {
    this.clearMarkers()
    this.cm = cm
    if (this.lastQuery) {
      this.search(this.lastQuery, this.lastOptions)
    }
  }

  public hasActiveQuery(): boolean {
    return Boolean(this.lastQuery)
  }

  public clearMarkers(): void {
    if (this.markers.length > 0) {
      for (const marker of this.markers) {
        try {
          marker.clear()
        } catch {
          // Ignore if already cleared
        }
      }
      this.markers = []
    }
    if (this.activeMarker) {
      try {
        this.activeMarker.clear()
      } catch {
        // Ignore
      }
      this.activeMarker = null
    }
  }

  public clear(): void {
    this.clearMarkers()
    this.matches = []
    this.currentIndex = -1
    this.lastQuery = ''
    this.lastOptions = {}
    this.editorStore.SEARCH({
      index: -1,
      matches: [],
      value: ''
    })
  }

  public search(value: string, opt: SearchOptions = {}, targetPos?: Position): void {
    if (!this.cm) return

    this.clearMarkers()
    this.lastQuery = value
    this.lastOptions = { ...opt }

    if (!value) {
      this.clear()
      return
    }

    const regex = buildSearchRegex(value, opt)
    if (!regex) {
      this.matches = []
      this.currentIndex = -1
      this.editorStore.SEARCH({ index: -1, matches: [], value })
      return
    }

    const matches: SearchMatch[] = []
    const isMultiline = value.includes('\n') || (opt.isRegexp && /\\n|\n/.test(value))

    if (isMultiline) {
      const text: string = this.cm.getValue()
      regex.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = regex.exec(text)) !== null) {
        if (m[0].length === 0) {
          regex.lastIndex++
          continue
        }
        matches.push({
          from: this.cm.posFromIndex(m.index),
          to: this.cm.posFromIndex(m.index + m[0].length),
          match: m[0],
          rawMatch: m
        })
        if (matches.length >= 5000) break
      }
    } else {
      const lineCount = this.cm.lineCount()
      for (let line = 0; line < lineCount; line++) {
        const lineText: string = this.cm.getLine(line)
        regex.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = regex.exec(lineText)) !== null) {
          if (m[0].length === 0) {
            regex.lastIndex++
            continue
          }
          matches.push({
            from: { line, ch: m.index },
            to: { line, ch: m.index + m[0].length },
            match: m[0],
            rawMatch: m
          })
          if (matches.length >= 5000) break
        }
        if (matches.length >= 5000) break
      }
    }

    this.matches = matches

    if (matches.length === 0) {
      this.currentIndex = -1
      this.editorStore.SEARCH({ index: -1, matches: [], value })
      return
    }

    // Determine active match index: prefer match at or after targetPos, or current cursor
    const refPos: Position = targetPos || this.cm.getCursor() || { line: 0, ch: 0 }
    let foundIndex = matches.findIndex((m) => {
      if (m.from.line > refPos.line) return true
      if (m.from.line === refPos.line && m.from.ch >= refPos.ch) return true
      return false
    })

    if (foundIndex === -1) {
      foundIndex = 0
    }
    this.currentIndex = foundIndex

    this.renderMarkers(opt.selectHighlight !== false)
    this.notifyStore()
  }

  public find(action: 'next' | 'previous'): void {
    if (!this.cm || this.matches.length === 0) return

    if (action === 'next') {
      this.currentIndex = (this.currentIndex + 1) % this.matches.length
    } else {
      this.currentIndex = (this.currentIndex - 1 + this.matches.length) % this.matches.length
    }

    this.renderMarkers(true)
    this.notifyStore()
  }

  public replace(replaceValue: string, opt: ReplaceOptions = {}): void {
    if (!this.cm || this.matches.length === 0) return

    if (opt.isSingle) {
      if (this.currentIndex < 0 || !this.matches[this.currentIndex]) return
      const active = this.matches[this.currentIndex]

      let replacement = replaceValue
      if (opt.isRegexp && active.rawMatch) {
        const regex = buildSearchRegex(this.lastQuery, opt)
        if (regex) {
          replacement = active.rawMatch[0].replace(regex, replaceValue)
        }
      }

      const nextTarget = { ...active.from }
      this.cm.replaceRange(replacement, active.from, active.to)

      // Re-run search to update all remaining matches
      this.search(this.lastQuery, this.lastOptions, nextTarget)
    } else {
      // Replace All: reverse order to preserve position integrity
      const regex = opt.isRegexp ? buildSearchRegex(this.lastQuery, opt) : null
      this.cm.operation(() => {
        for (let i = this.matches.length - 1; i >= 0; i--) {
          const m = this.matches[i]
          let replacement = replaceValue
          if (regex && m.rawMatch) {
            replacement = m.rawMatch[0].replace(regex, replaceValue)
          }
          this.cm.replaceRange(replacement, m.from, m.to)
        }
      })

      // Re-run search after replace all
      this.search(this.lastQuery, this.lastOptions)
    }
  }

  public refresh(): void {
    if (this.lastQuery) {
      this.search(this.lastQuery, this.lastOptions)
    }
  }

  private renderMarkers(scrollAndSelect: boolean = true): void {
    if (!this.cm) return

    this.cm.operation(() => {
      this.clearMarkers()

      for (let i = 0; i < this.matches.length; i++) {
        const m = this.matches[i]
        if (i === this.currentIndex) {
          this.activeMarker = this.cm.markText(m.from, m.to, {
            className: 'cm-search-match-active'
          })
        } else {
          this.markers.push(
            this.cm.markText(m.from, m.to, {
              className: 'cm-search-match'
            })
          )
        }
      }
    })

    if (scrollAndSelect && this.currentIndex >= 0 && this.matches[this.currentIndex]) {
      const active = this.matches[this.currentIndex]
      this.cm.scrollIntoView({ from: active.from, to: active.to }, 100)
      this.cm.setSelection(active.from, active.to)
    }
  }

  private notifyStore(): void {
    this.editorStore.SEARCH({
      index: this.currentIndex,
      matches: this.matches.map((m) => ({ start: 0, end: 0, match: m.match })),
      value: this.lastQuery
    })
  }

  public destroy(): void {
    this.clearMarkers()
    this.matches = []
    this.currentIndex = -1
    this.cm = null
  }
}
