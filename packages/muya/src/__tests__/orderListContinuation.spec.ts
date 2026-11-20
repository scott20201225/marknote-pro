// @vitest-environment happy-dom

import type Content from '../block/base/content';
import type OrderList from '../block/commonMark/orderList';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../muya';

const bootedHosts: HTMLElement[] = [];
let originalVersion: string | undefined;
let hadVersion = false;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length) {
        const host = bootedHosts.pop()!;
        host.remove();
    }
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

describe('Ordered list continuation and restart', () => {
    it('continues previous numbering and restarts list via Muya API', async () => {
        const md = '1. first\n2. second\n\nintervening text\n\n1. third\n2. fourth\n';
        const muya = bootMuya(md);

        const page = muya.editor.scrollPage!;
        const lists = [...page.children.iterator()].filter((b: any) => b.blockName === 'order-list') as OrderList[];
        expect(lists.length).toBe(2);

        const [list1, list2] = lists;
        expect(list1.meta.start).toBe(1);
        expect(list2.meta.start).toBe(1);

        // Place cursor in list2
        const contentInList2 = list2.firstContentInDescendant()!;
        muya.editor.activeContentBlock = contentInList2;

        // Continue previous numbering
        muya.continueOrderListNumbering();
        expect(list2.meta.start).toBe(3);
        expect(list2.domNode.getAttribute('start')).toBe('3');

        // Restart new list
        muya.restartOrderListNumbering();
        expect(list2.meta.start).toBe(1);
        expect(list2.domNode.getAttribute('start')).toBe('1');
    });

    it('handles continue-numbering and restart-numbering via updateParagraph', async () => {
        const md = '1. a\n2. b\n3. c\n\nmiddle paragraph\n\n1. d\n';
        const muya = bootMuya(md);

        const page = muya.editor.scrollPage!;
        const lists = [...page.children.iterator()].filter((b: any) => b.blockName === 'order-list') as OrderList[];
        expect(lists.length).toBe(2);

        const [list1, list2] = lists;
        const contentInList2 = list2.firstContentInDescendant()!;
        muya.editor.activeContentBlock = contentInList2;

        muya.updateParagraph('continue-numbering');
        expect(list2.meta.start).toBe(4);

        muya.updateParagraph('restart-numbering');
        expect(list2.meta.start).toBe(1);
    });

    it('automatically continues previous numbering when typing "1. " after an ordered list', async () => {
        const md = '1. item 1\n2. item 2\n\nintervening paragraph\n';
        const muya = bootMuya(md);

        const page = muya.editor.scrollPage!;
        const paragraph = [...page.children.iterator()].find((b: any) => b.blockName === 'paragraph');
        expect(paragraph).toBeDefined();

        const content = paragraph!.firstContentInDescendant()! as Content;
        muya.editor.activeContentBlock = content;
        content.domNode!.textContent = '1. new item';
        content.setCursor(3, 3);
        content.inputHandler(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));

        await vi.waitFor(() => {
            const state = muya.getState();
            const secondList = state[1];
            expect(secondList.name).toBe('order-list');
            // Previous list had 2 items starting from 1, so new list starts from 3
            expect((secondList as any).meta.start).toBe(3);
        });
    });

    it('continues previous numbering when splitting list via enter on empty item', async () => {
        const md = '1. first\n2. second\n3. third\n';
        const muya = bootMuya(md);

        const page = muya.editor.scrollPage!;
        const list = page.children.head as any;
        expect(list.blockName).toBe('order-list');

        // Make second item empty then press Enter
        const secondItem = list.children.head.next;
        const secondContent = secondItem.firstContentInDescendant() as Content;
        secondContent.text = '';
        secondContent.domNode!.textContent = '';

        muya.editor.activeContentBlock = secondContent;
        secondContent.setCursor(0, 0, true);
        const event = {
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
            shiftKey: false,
            key: 'Enter',
        } as unknown as KeyboardEvent;
        secondContent.enterHandler(event);

        await vi.waitFor(() => {
            const state = muya.getState();
            expect(state.length).toBe(3);
            expect(state[0].name).toBe('order-list');
            expect(state[1].name).toBe('paragraph');
            expect(state[2].name).toBe('order-list');

            // First list has 1 item starting from 1
            expect((state[0] as any).meta.start).toBe(1);
            // Second list continues numbering: offset 1 + start 1 = 2
            expect((state[2] as any).meta.start).toBe(2);
        });
    });
});
