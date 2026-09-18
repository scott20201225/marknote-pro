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
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
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

function contentByText(muya: Muya, text: string): Content {
    let target: Content | null = null;
    const visit = (block: {
        text?: string;
        constructor: { blockName?: string };
        children?: { forEach: (cb: (b: unknown) => void) => void };
    }) => {
        if (block.constructor.blockName?.endsWith('.content') && block.text === text)
            target = block as unknown as Content;
        block.children?.forEach(child => visit(child as typeof block));
    };
    visit(muya.editor.scrollPage as unknown as Parameters<typeof visit>[0]);
    if (!target)
        throw new Error(`content block with text "${text}" not found`);
    return target;
}

function deleteLine(muya: Muya, content: Content, offset: number) {
    muya.editor.activeContentBlock = content;
    content.setCursor(offset, offset, true);
    const event = {
        key: 'Backspace',
        altKey: true,
        metaKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
    content.keydownHandler(event);
    return event;
}

function flush(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

describe('Alt/Command+Backspace — delete current line', () => {
    it('removes only the current physical line from a multi-line paragraph', () => {
        const muya = bootMuya('before\ndelete me\nafter\n');
        const current = contentByText(muya, 'before\ndelete me\nafter');

        const event = deleteLine(muya, current, 'before\ndel'.length);

        expect(current.text).toBe('before\nafter');
        expect(current.getCursor()?.start.offset).toBe('before\n'.length);
        expect(event.preventDefault).toHaveBeenCalledOnce();
    });

    it('removes a list item without corrupting the surrounding list', async () => {
        const muya = bootMuya('- first\n- delete me\n- last\n');

        deleteLine(muya, contentByText(muya, 'delete me'), 0);
        await flush();

        expect(muya.getMarkdown()).toBe('- first\n- last\n');
        expect(muya.editor.activeContentBlock?.text).toBe('last');
    });

    it('removes just the physical current line in a code block', () => {
        const muya = bootMuya('```ts\nfirst\ndelete me\nlast\n```\n');
        const content = contentByText(muya, 'first\ndelete me\nlast');

        deleteLine(muya, content, 'first\nde'.length);

        expect(content.text).toBe('first\nlast');
        expect(content.getCursor()?.start.offset).toBe('first\n'.length);
        expect(muya.getMarkdown()).toContain('```ts');
    });
});
