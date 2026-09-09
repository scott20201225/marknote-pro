// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya } from '../../../muya';
import { getOffsetOfParagraph } from '../../../selection/dom';
import { normalizeUnicodeOffset } from '../../../utils';

const bootedHosts: HTMLElement[] = [];

beforeEach(() => {
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
    document.getSelection()?.removeAllRanges();
    delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

describe('unicode-safe text editing', () => {
    it('treats a half-surrogate left by Backspace as deletion of the full emoji', () => {
        const muya = bootMuya('😀\n');
        const content = muya.editor.scrollPage!.firstContentInDescendant()!;

        expect(() => {
            content.text = '\uD83D';
            muya.editor.jsonState.flush();
        }).not.toThrow();

        expect(content.text).toBe('');
        expect(muya.getMarkdown().trim()).toBe('');
    });

    it('keeps valid text around an emoji when the browser leaves a half-surrogate', () => {
        const muya = bootMuya('前😀后\n');
        const content = muya.editor.scrollPage!.firstContentInDescendant()!;

        expect(() => {
            content.text = '前\uDE00后';
            muya.editor.jsonState.flush();
        }).not.toThrow();

        expect(content.text).toBe('前后');
        expect(muya.getMarkdown().trim()).toBe('前后');
    });

    it('keeps the caret after the preceding text when the DOM leaves an orphan surrogate', () => {
        const muya = bootMuya('前😀\n');
        const content = muya.editor.scrollPage!.firstContentInDescendant()!;
        const paragraph = content.domNode!;
        paragraph.replaceChildren(
            document.createTextNode('前'),
            document.createTextNode('\uD83D'),
        );

        const orphanText = paragraph.lastChild!;
        const rawOffset = getOffsetOfParagraph(
            orphanText,
            paragraph,
            orphanText.textContent!.length,
        );

        expect(rawOffset).toBe(2);
        expect(normalizeUnicodeOffset('前\uD83D', rawOffset)).toBe(1);

        const selection = document.getSelection()!;
        const range = document.createRange();
        // Simulate the browser placing the caret at the wrong boundary after
        // deleting the first UTF-16 code unit of the emoji.
        range.setStart(paragraph, 0);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);

        content.inputHandler(
            new InputEvent('input', {
                bubbles: true,
                inputType: 'deleteContentBackward',
            }),
        );

        expect(content.text).toBe('前');
        expect(content.getCursor()!.start.offset).toBe(1);
        expect(content.getCursor()!.end.offset).toBe(1);
    });
});
