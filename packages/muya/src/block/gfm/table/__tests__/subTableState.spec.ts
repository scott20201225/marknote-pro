// @vitest-environment happy-dom

import type Table from '..';
import type { ITableState } from '../../../../state/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya } from '../../../../muya';

// Unit coverage for the cross-cell selection building blocks added for the
// Phase G table-selection restoration: `Table.cellAt` (resolve a body cell by
// row/column offsets) and `Table.getSubTableState` (extract a rectangular block
// of cells as an `ITableState` so the clipboard can serialise just that range).

const bootedHosts: HTMLElement[] = [];
let hadVersion = false;
let originalVersion: string | undefined;

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

// A 3-row × 3-column table: header (a1/b1/c1) plus two body rows.
const TABLE_MD = [
    '| a1 | b1 | c1 |',
    '| --- | --- | --- |',
    '| a2 | b2 | c2 |',
    '| a3 | b3 | c3 |',
    '',
].join('\n');

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

function firstTable(muya: Muya): Table {
    const block = muya.editor.scrollPage!.firstContentInDescendant()!.closestBlock('table');
    return block as Table;
}

function cellTexts(state: ITableState): string[][] {
    return state.children.map(row => row.children.map(cell => cell.text));
}

describe('table.cellAt', () => {
    it('resolves a body cell by (row, column) offsets', () => {
        const table = firstTable(bootMuya(TABLE_MD));
        const cell = table.cellAt(2, 1); // 3rd row, 2nd column => "b3"
        expect(cell).not.toBeNull();
        expect(cell!.getState().text).toBe('b3');
    });

    it('returns null for an out-of-range row or column', () => {
        const table = firstTable(bootMuya(TABLE_MD));
        expect(table.cellAt(9, 0)).toBeNull();
        expect(table.cellAt(0, 9)).toBeNull();
    });
});

describe('table.getSubTableState', () => {
    it('extracts the rectangle between two corners (header becomes the sub-table header)', () => {
        const table = firstTable(bootMuya(TABLE_MD));
        // Rows 0..1, columns 0..1 => a1/b1 + a2/b2.
        const state = table.getSubTableState(0, 0, 1, 1);
        expect(cellTexts(state)).toEqual([
            ['a1', 'b1'],
            ['a2', 'b2'],
        ]);
    });

    it('normalises reversed bounds (focus before anchor)', () => {
        const table = firstTable(bootMuya(TABLE_MD));
        // Same rectangle, corners passed bottom-right -> top-left.
        const state = table.getSubTableState(2, 2, 1, 1);
        expect(cellTexts(state)).toEqual([
            ['b2', 'c2'],
            ['b3', 'c3'],
        ]);
    });

    it('clamps bounds that exceed the table dimensions', () => {
        const table = firstTable(bootMuya(TABLE_MD));
        const state = table.getSubTableState(0, 0, 99, 99);
        // The full 3x3 table is returned, not a ragged/oversized one.
        expect(cellTexts(state)).toEqual([
            ['a1', 'b1', 'c1'],
            ['a2', 'b2', 'c2'],
            ['a3', 'b3', 'c3'],
        ]);
    });

    it('preserves per-column alignment in the extracted cells', () => {
        const aligned = [
            '| h1 | h2 |',
            '| :--- | ---: |',
            '| x | y |',
            '',
        ].join('\n');
        const table = firstTable(bootMuya(aligned));
        const state = table.getSubTableState(0, 0, 1, 1);
        expect(state.children[0].children[0].meta.align).toBe('left');
        expect(state.children[0].children[1].meta.align).toBe('right');
    });
});

describe('table.pasteTableStateAt', () => {
    it('overwrites from the target cell and appends missing rows and columns', async () => {
        const table = firstTable(bootMuya([
            '| a1 | b1 |',
            '| --- | --- |',
            '| a2 | b2 |',
            '',
        ].join('\n')));
        const pasted: ITableState = {
            name: 'table',
            children: [
                {
                    name: 'table.row',
                    children: [
                        { name: 'table.cell', meta: { align: 'none' }, text: 'x1' },
                        { name: 'table.cell', meta: { align: 'none' }, text: 'y1' },
                    ],
                },
                {
                    name: 'table.row',
                    children: [
                        { name: 'table.cell', meta: { align: 'none' }, text: 'x2' },
                        { name: 'table.cell', meta: { align: 'none' }, text: 'y2' },
                    ],
                },
            ],
        };

        const cursorContent = table.pasteTableStateAt(1, 1, pasted);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

        expect(table.rowCount).toBe(3);
        expect(table.columnCount).toBe(3);
        expect(cellTexts(table.getState())).toEqual([
            ['a1', 'b1', ''],
            ['a2', 'x1', 'y1'],
            ['', 'x2', 'y2'],
        ]);
        expect(cursorContent?.text).toBe('y2');
    });
});
