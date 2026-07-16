// @vitest-environment happy-dom

import type Content from '../content';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';

const bootedHosts: HTMLElement[] = [];
let originalVersion: string | undefined;
let hadVersion = false;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    vi.restoreAllMocks();
    while (bootedHosts.length) {
        const host = bootedHosts.pop()!;
        host.remove();
    }
    document.getSelection()?.removeAllRanges();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
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

function firstTableCell(muya: Muya): Content {
    const out: Content[] = [];
    const visit = (block: {
        constructor: { blockName?: string };
        children?: { forEach: (cb: (b: unknown) => void) => void };
    }) => {
        if (block.constructor.blockName === 'table.cell.content')
            out.push(block as unknown as Content);
        block.children?.forEach(b => visit(b as typeof block));
    };
    visit(muya.editor.scrollPage as unknown as Parameters<typeof visit>[0]);
    return out[0];
}

describe('Format.keyupHandler with a detached native selection', () => {
    it('returns quietly when a table cell still has cached selection metadata but getCursor() is null', () => {
        const muya = bootMuya('| a | b |\n| --- | --- |\n| c | d |\n');
        const cell = firstTableCell(muya);

        vi.spyOn(muya.editor.selection, 'isSelectionInSameBlock', 'get').mockReturnValue(true);
        vi.spyOn(muya.editor.selection, 'anchor', 'get').mockReturnValue({
            offset: 0,
            block: cell,
            path: cell.path,
        });
        vi.spyOn(muya.editor.selection, 'focus', 'get').mockReturnValue({
            offset: 0,
            block: cell,
            path: cell.path,
        });
        vi.spyOn(cell, 'getCursor').mockReturnValue(null);
        const setCursorSpy = vi.spyOn(cell, 'setCursor');

        expect(() => cell.keyupHandler()).not.toThrow();
        expect(setCursorSpy).not.toHaveBeenCalled();
    });
});
