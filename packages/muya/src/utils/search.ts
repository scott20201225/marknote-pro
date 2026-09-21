import type { IMatch, ISearchOption } from '../search/types';

export interface IStringMatch {
    match: string;
    subMatches: string[];
    index: number;
}

function isHighSurrogate(code: number) {
    return code >= 0xD800 && code <= 0xDBFF;
}

function isLowSurrogate(code: number) {
    return code >= 0xDC00 && code <= 0xDFFF;
}

function splitsSurrogatePair(text: string, index: number) {
    return isHighSurrogate(text.charCodeAt(index - 1)) && isLowSurrogate(text.charCodeAt(index));
}

function execAll(regexp: RegExp, text: string): IStringMatch[] {
    const matches: IStringMatch[] = [];
    let result: RegExpExecArray | null;

    // eslint-disable-next-line no-cond-assign
    while ((result = regexp.exec(text)) !== null) {
        const [match, ...subMatches] = result;
        const { index } = result;
        if (match === '')
            regexp.lastIndex = index + (regexp.unicode && splitsSurrogatePair(text, index + 1) ? 2 : 1);

        matches.push({ match, subMatches, index });
    }

    return matches;
}

function mayHaveMultiUnitClusters(text: string) {
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code >= 0x300 || code === 0x0D)
            return true;
    }

    return false;
}

function graphemeStarts(text: string): number[] {
    const Segmenter = (Intl as typeof Intl & {
        Segmenter?: new (locales?: string | string[], options?: { granularity: 'grapheme' }) => {
            segment(value: string): Iterable<{ index: number }>;
        };
    }).Segmenter;
    if (Segmenter)
        return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.index);

    const starts: number[] = [];
    let index = 0;
    for (const character of text) {
        starts.push(index);
        index += character.length;
    }
    return starts;
}

function alignToGraphemeClusters(text: string, matches: IStringMatch[], expand: boolean): IStringMatch[] {
    if (!matches.length || !mayHaveMultiUnitClusters(text))
        return matches;

    const isBoundary = Array.from<boolean>({ length: text.length + 1 }).fill(false);
    for (const start of graphemeStarts(text))
        isBoundary[start] = true;
    isBoundary[text.length] = true;

    const aligned: IStringMatch[] = [];
    for (const match of matches) {
        let start = match.index;
        let end = start + match.match.length;
        if (!isBoundary[start] || !isBoundary[end]) {
            if (!expand || start === end)
                continue;

            while (!isBoundary[start])
                start--;
            while (!isBoundary[end])
                end++;
        }

        const previous = aligned[aligned.length - 1];
        const previousEnd = previous ? previous.index + previous.match.length : 0;
        if (previous && start < previousEnd) {
            if (end > previousEnd)
                previous.match = text.slice(previous.index, end);

            continue;
        }

        aligned.push({ ...match, match: text.slice(start, end), index: start });
    }

    return aligned;
}

function createSearchRegExp(source: string, flags: string, isRegexp: boolean): RegExp | null {
    const candidates = isRegexp ? [`${flags}u`, flags] : [flags];
    for (const candidate of candidates) {
        try {
            return new RegExp(source, candidate);
        }
        catch {
            // Some legacy patterns are valid only without the Unicode flag.
        }
    }

    return null;
}

export function matchString(text: string, value: string, options: ISearchOption): IStringMatch[] {
    const { isCaseSensitive, isWholeWord, isRegexp } = options;

    const SPECIAL_CHAR_REG = /[[\]\\^$.|?*+(){}/]/g;

    let regStr = value;
    let flag = 'g';

    if (!isCaseSensitive)
        flag += 'i';

    if (!isRegexp) {
        regStr = value.replace(SPECIAL_CHAR_REG, p => {
            return p === '\\' ? '\\\\' : `\\${p}`;
        });
    }

    if (isWholeWord)
        regStr = `\\b${regStr}\\b`;

    const regexp = createSearchRegExp(regStr, flag, !!isRegexp);
    return regexp ? alignToGraphemeClusters(text, execAll(regexp, text), !!isRegexp) : [];
}

export function buildRegexValue(match: IMatch, value: string) {
    const groups = value.match(/(?<!\\)\$\d/g);

    if (Array.isArray(groups) && groups.length) {
        for (const group of groups) {
            const index = Number.parseInt(group.replace(/^\$/, ''));
            if (index === 0)
                value = value.replace(group, match.match);
            else if (index > 0 && index <= match.subMatches.length)
                value = value.replace(group, match.subMatches[index - 1]);
        }
    }

    return value;
}
