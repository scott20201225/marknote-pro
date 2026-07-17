// @vitest-environment happy-dom

import type Table from '../../../block/gfm/table';
import type TableBodyCell from '../../../block/gfm/table/cell';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';
import { TableDragBar } from '../index';

const TABLE_MD = [
    '| a1 | b1 | c1 |',
    '| --- | --- | --- |',
    '| a2 | b2 | c2 |',
    '| a3 | b3 | c3 |',
    '',
].join('\n');

const bootedHosts: HTMLElement[] = [];
let hadVersion = false;
let originalVersion: string | undefined;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

function firstTable(muya: Muya): Table {
    return muya.editor.scrollPage!.firstContentInDescendant()!.closestBlock('table') as Table;
}

function mouse(type: string, clientX = 0, clientY = 0): MouseEvent {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX,
        clientY,
    });
    if (!('x' in event))
        Object.defineProperty(event, 'x', { value: clientX, configurable: true });
    if (!('y' in event))
        Object.defineProperty(event, 'y', { value: clientY, configurable: true });
    return event;
}

function armDragBar(plugin: TableDragBar, table: Table, row: number, column: number, barType: 'bottom' | 'right') {
    const cell = table.cellAt(row, column) as TableBodyCell;
    const anyPlugin = plugin as TableDragBar & {
        _block: TableBodyCell | null;
        _barType: 'bottom' | 'right' | null;
    };
    anyPlugin._block = cell;
    anyPlugin._barType = barType;
    return cell;
}

describe('tableDragBar', () => {
    it('starts dragging immediately on mousedown', () => {
        const muya = bootMuya(TABLE_MD);
        const table = firstTable(muya);
        const plugin = new TableDragBar(muya);
        armDragBar(plugin, table, 0, 0, 'bottom');

        (plugin as TableDragBar & { _mousedown: (event: Event) => void })._mousedown(mouse('mousedown'));

        const anyPlugin = plugin as TableDragBar & {
            _dragInfo: unknown;
        };

        expect(anyPlugin._dragInfo).not.toBe(null);
        expect(table.domNode!.querySelectorAll('.mu-cell-transform').length).toBeGreaterThan(0);
    });

    it('cleans drag styles when a started drag is released without an effective reorder', () => {
        const muya = bootMuya(TABLE_MD);
        const table = firstTable(muya);
        const plugin = new TableDragBar(muya);
        armDragBar(plugin, table, 0, 0, 'bottom');

        (plugin as TableDragBar & { _startDrag: (event: Event) => void })._startDrag(mouse('mousedown', 10, 10));

        expect(table.domNode!.querySelectorAll('.mu-cell-transform').length).toBeGreaterThan(0);

        (plugin as TableDragBar & { _docMouseup: (event: Event) => void })._docMouseup(mouse('mouseup', 10, 10));

        const anyPlugin = plugin as TableDragBar & {
            _dragInfo: unknown;
            _isDragTableBar: boolean;
        };

        expect(anyPlugin._dragInfo).toBe(null);
        expect(anyPlugin._isDragTableBar).toBe(false);
        expect(table.domNode!.querySelectorAll('.mu-cell-transform').length).toBe(0);
        expect(table.domNode!.querySelectorAll('.mu-drag-cell').length).toBe(0);
        expect(
            Array.from(table.domNode!.querySelectorAll('th, td')).every(
                cell => (cell as HTMLElement).style.transform === '',
            ),
        ).toBe(true);
    });

    it('does not emit muya-table-bar on a plain press and release', () => {
        const muya = bootMuya(TABLE_MD);
        const table = firstTable(muya);
        const plugin = new TableDragBar(muya);
        const emitSpy = vi.spyOn(muya.eventCenter, 'emit');
        armDragBar(plugin, table, 0, 0, 'bottom');

        (plugin as TableDragBar & { _mousedown: (event: Event) => void })._mousedown(mouse('mousedown', 10, 10));
        (plugin as TableDragBar & { _docMouseup: (event: Event) => void })._docMouseup(mouse('mouseup', 10, 10));

        expect(emitSpy).not.toHaveBeenCalledWith(
            'muya-table-bar',
            expect.anything(),
        );
    });
});
