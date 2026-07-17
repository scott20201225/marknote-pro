import type { VNode } from 'snabbdom';
import type TableBodyCell from '../../block/gfm/table/cell';
import type { Muya } from '../../index';
import { BLOCK_DOM_PROPERTY } from '../../config';
import { isMouseEvent, throttle } from '../../utils';
import { h, patch } from '../../utils/snabbdom';
import BaseFloat from '../baseFloat';
import { resolveTableCellContext } from '../tableContext';
import { clearTableHighlight, getTableInnerElement, getWholeTableHighlightCells, setTableHighlight } from '../tableHighlight';

import './index.css';

const svgIcon = (body: string) =>
    `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">
            <g stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                ${body}
            </g>
        </svg>
    `)}`;

const deleteTableIcon = svgIcon(`
    <path d="M3.5 4.5h9" />
    <path d="M6.25 2.75h3.5" />
    <path d="M5 4.5v7.25" />
    <path d="M8 4.5v7.25" />
    <path d="M11 4.5v7.25" />
    <path d="M4.25 4.5 4.9 13h6.2l.65-8.5" />
`);

const defaultOptions = {
    placement: 'top-start' as const,
    offsetOptions: {
        mainAxis: 0,
        crossAxis: 0,
        alignmentAxis: 0,
    },
    showArrow: false,
};

export class TableDeleteButton extends BaseFloat {
    private static readonly HIGHLIGHT_OWNER = 'table-delete-button';
    private _oldVNode: VNode | null = null;
    private _block: TableBodyCell | null = null;
    private _buttonContainer: HTMLDivElement = document.createElement('div');

    static pluginName = 'tableDeleteButton';
    public override capturesContentKeydown = true;

    constructor(muya: Muya, options = {}) {
        const name = 'mu-table-delete-button';
        const opts = Object.assign({}, defaultOptions, options);
        super(muya, name, opts);
        this.options = opts;
        this.container!.appendChild(this._buttonContainer);
        this.floatBox!.classList.add('mu-table-delete-button-container');
        this.listen();
    }

    override listen() {
        const { eventCenter } = this.muya;
        super.listen();

        const handler = throttle((event: Event) => {
            if (!isMouseEvent(event))
                return;

            const { x, y } = event;
            const elements = [...document.elementsFromPoint(x, y)];
            if (this._isHoveringSelf(elements) || this._isInsideHoverBridge(x, y))
                return;

            const isOnTableTool = elements.some(element =>
                element instanceof HTMLElement
                && !!element.closest(
                    '.mu-table-row-tools-container, .mu-table-column-tools-container, .mu-table-drag-container, .mu-table-bar-tools, .mu-table-delete-button-container',
                ),
            );
            const tableCellEle = elements.find(
                element =>
                    element[BLOCK_DOM_PROPERTY]
                    && element[BLOCK_DOM_PROPERTY].blockName === 'table.cell',
            );

            if (tableCellEle) {
                const cellBlock = tableCellEle[BLOCK_DOM_PROPERTY] as TableBodyCell;
                this._block = cellBlock;
                this._showAtTableCorner(cellBlock);
                this.render();
            }
            else if (isOnTableTool && this._block) {
                this._showAtTableCorner(this._block);
                this.render();
            }
            else {
                this.hide();
            }
        });

        eventCenter.attachDOMEvent(document.body, 'mousemove', handler);
    }

    render() {
        const { _oldVNode: oldVNode, _buttonContainer: buttonContainer } = this;
        const tooltip = this.muya.i18n.t('Delete Table');
        const icon = h(
            'i.icon',
            h(
                'i.icon-inner',
                {
                    style: {
                        background: `url(${deleteTableIcon}) no-repeat`,
                        'background-size': '100%',
                    },
                },
                '',
            ),
        );

        const vnode = h(
            'button.button',
            {
                attrs: {
                    type: 'button',
                    title: tooltip,
                    'aria-label': tooltip,
                },
                dataset: {
                    tooltip,
                },
                on: {
                    mouseenter: () => {
                        this._highlightWholeTable();
                    },
                    mouseleave: () => {
                        clearTableHighlight(TableDeleteButton.HIGHLIGHT_OWNER);
                    },
                    click: (event) => {
                        this._deleteTable(event);
                    },
                },
            },
            [icon],
        );

        if (oldVNode)
            patch(oldVNode, vnode);
        else
            patch(buttonContainer, vnode);

        this._oldVNode = vnode;
    }

    private _showAtTableCorner(cellBlock: TableBodyCell) {
        const GAP = 2;
        const context = resolveTableCellContext(cellBlock);
        if (!context) {
            this.hide();
            return;
        }

        const { table } = context;
        const tableInnerElement = table.firstChild?.domNode;
        const tableElement = tableInnerElement instanceof HTMLTableElement
            ? tableInnerElement
            : table.domNode!;
        const pointReference = {
            getBoundingClientRect: () => {
                const rect = tableElement.getBoundingClientRect();
                const x = rect.left + rect.width + GAP;
                const y = rect.top - GAP;
                return {
                    x,
                    y,
                    left: x,
                    right: x,
                    top: y,
                    bottom: y,
                    width: 0,
                    height: 0,
                    toJSON() {
                        return this;
                    },
                } as DOMRect;
            },
        };

        super.show(pointReference as never);
    }

    private _deleteTable(event: Event) {
        event.preventDefault();
        event.stopPropagation();

        const context = resolveTableCellContext(this._block);
        if (!context) {
            this.hide();
            return;
        }

        context.block.firstContentInDescendant()?.setCursor(0, 0, true);
        this.muya.tableAction('table.delete');
        this.hide();
    }

    override hide() {
        this._block = null;
        clearTableHighlight(TableDeleteButton.HIGHLIGHT_OWNER);
        super.hide();
    }

    private _isHoveringSelf(elements: Element[]) {
        const { floatBox, container } = this;
        if (!floatBox || !container)
            return false;

        return elements.some(element =>
            floatBox.contains(element) || container.contains(element),
        );
    }

    private _isInsideHoverBridge(x: number, y: number) {
        const { _block: block, floatBox } = this;
        if (!this.status || !block || !floatBox)
            return false;

        const context = resolveTableCellContext(block);
        if (!context) {
            this._block = null;
            return false;
        }

        const tableRectSource = context.table.firstChild?.domNode instanceof HTMLTableElement
            ? context.table.firstChild.domNode
            : context.table.domNode;
        const tableRect = tableRectSource?.getBoundingClientRect();
        const floatRect = floatBox.getBoundingClientRect();
        if (!tableRect || !floatRect.width || !floatRect.height)
            return false;

        const left = Math.min(tableRect.left, floatRect.left) - 8;
        const right = Math.max(tableRect.right, floatRect.right) + 8;
        const top = Math.min(tableRect.top, floatRect.top) - 8;
        const bottom = Math.max(tableRect.bottom, floatRect.bottom) + 8;

        return x >= left && x <= right && y >= top && y <= bottom;
    }

    private _highlightWholeTable() {
        const context = resolveTableCellContext(this._block);
        const tableInner = context ? getTableInnerElement(context.table) : null;
        if (!tableInner)
            return;

        setTableHighlight(
            TableDeleteButton.HIGHLIGHT_OWNER,
            getWholeTableHighlightCells(tableInner),
        );
    }
}
