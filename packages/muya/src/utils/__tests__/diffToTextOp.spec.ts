import diff from 'fast-diff';
import * as otText from 'ot-text-unicode';
import { describe, expect, it } from 'vitest';
import {
    diffToTextOp,
    getDeletionCaretOffset,
    normalizeUnicodeOffset,
    normalizeUnicodeText,
} from '../index';

describe('diffToTextOp Unicode offsets', () => {
    it('removes an orphan surrogate without producing an invalid OT component', () => {
        const operation = diffToTextOp(diff('😀', '\uD83D'));

        expect(operation).toEqual([{ d: '😀' }]);
        expect(otText.type.apply('😀', operation)).toBe('');
    });

    it('maps a DOM offset after an orphan surrogate onto normalized text', () => {
        const raw = '前\uD83D后';

        expect(normalizeUnicodeText(raw)).toBe('前后');
        expect(normalizeUnicodeOffset(raw, 2)).toBe(1);
        expect(normalizeUnicodeOffset(raw, raw.length)).toBe(2);
    });

    it('recovers the deletion caret from the first changed position', () => {
        expect(getDeletionCaretOffset('前😀', '前', 'deleteContentBackward')).toBe(1);
        expect(getDeletionCaretOffset('😀后', '后', 'deleteContentForward')).toBe(0);
        expect(getDeletionCaretOffset('前😀后', '前后', 'insertText')).toBeNull();
    });

    it('counts code points instead of grapheme clusters', () => {
        const family = '👨‍👩‍👧‍👦';

        expect(diffToTextOp(diff(family, `${family}x`))).toEqual([7, 'x']);
    });

    it('keeps edits after a multi-code-point grapheme at the correct position', () => {
        const before = '前缀 👨‍👩‍👧‍👦';
        const after = `${before} 后缀`;
        const operation = diffToTextOp(diff(before, after));

        expect(otText.type.apply(before, operation)).toBe(after);
    });

    it('composes consecutive edits without corrupting Unicode offsets', () => {
        const before = '👨‍👩‍👧‍👦';
        const middle = `${before} 一`;
        const after = `${middle} 二`;
        const first = diffToTextOp(diff(before, middle));
        const second = diffToTextOp(diff(middle, after));
        const composed = otText.type.compose(first, second);

        expect(otText.type.apply(before, composed)).toBe(after);
    });
});
