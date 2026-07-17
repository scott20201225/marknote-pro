import type { VNode } from 'snabbdom';
import type TableBodyCell from '../../block/gfm/table/cell';
import type { Muya } from '../../index';
import type { TableRowToolAction } from './config';
import { BLOCK_DOM_PROPERTY } from '../../config';
import { isMouseEvent, throttle } from '../../utils';
import { h, patch } from '../../utils/snabbdom';
import BaseFloat from '../baseFloat';
import { resolveTableCellContext } from '../tableContext';
import { clearTableHighlight, getRowHighlightCells, setTableHighlight } from '../tableHighlight';
import actions from './config';

import './index.css';

const OFFSET = 27;
const SHOW_DELAY = 500;

const defaultOptions = {
    placement: 'left-start' as const,
    offsetOptions: {
        mainAxis: 0,
        crossAxis: 0,
        alignmentAxis: 0,
    },
    showArrow: false,
};

export class TableRowToolbar extends BaseFloat {
    private static readonly HIGHLIGHT_OWNER = 'table-row-toolbar';
    private _oldVNode: VNode | null = null;
    private _block: TableBodyCell | null = null;
    private _showTimer: ReturnType<typeof setTimeout> | null = null;
    private _pendingCell: HTMLElement | null = null;
    private _pendingBlock: TableBodyCell | null = null;
    private _actions: TableRowToolAction[] = [...actions];
    private _toolsContainer: HTMLDivElement = document.createElement('div');

    static pluginName = 'tableRowTools';
    public override capturesContentKeydown = true;

    constructor(muya: Muya, options = {}) {
        const name = 'mu-table-row-tools';
        const opts = Object.assign({}, defaultOptions, options);
        super(muya, name, opts);
        this.options = opts;
        this.container!.appendChild(this._toolsContainer);
        this.floatBox!.classList.add('mu-table-row-tools-container');
        this.listen();
    }

    override listen() {
        const { eventCenter } = this.muya;
        super.listen();

        const handler = throttle((event: Event) => {
            if (!isMouseEvent(event))
                return;

            const { x, y } = event;
            const eles = [...document.elementsFromPoint(x, y)];
            const rightEles = [...document.elementsFromPoint(x + OFFSET, y)];
            if (this._isHoveringSelf(eles) || this._isInsideHoverBridge(x, y))
                return;

            const hasTableCell = (elements: Element[]) => {
                return elements.some(
                    element =>
                        element[BLOCK_DOM_PROPERTY]
                        && element[BLOCK_DOM_PROPERTY].blockName === 'table.cell',
                );
            };

            if (!hasTableCell(eles) && hasTableCell(rightEles)) {
                const tableCellEle = rightEles.find(
                    element =>
                        element[BLOCK_DOM_PROPERTY]
                        && element[BLOCK_DOM_PROPERTY].blockName === 'table.cell',
                );
                const cellBlock = tableCellEle![BLOCK_DOM_PROPERTY] as TableBodyCell;
                this._scheduleShow(tableCellEle as HTMLElement, cellBlock);
            }
            else {
                this._clearShowTimer();
                this.hide();
            }
        });

        eventCenter.attachDOMEvent(document.body, 'mousemove', handler);
        eventCenter.attachDOMEvent(this.container!, 'mouseenter', () => {
            if (this._block)
                this._highlightCurrentRow(this._block);
        });
        eventCenter.attachDOMEvent(this.container!, 'mouseleave', () => {
            clearTableHighlight(TableRowToolbar.HIGHLIGHT_OWNER);
        });
    }

    render() {
        const { _actions: actionList, _oldVNode: oldVNode, _toolsContainer: toolsContainer } = this;
        const { i18n } = this.muya;
        const children = actionList.map((action) => {
            const icon = h(
                'i.icon',
                h(
                    'i.icon-inner',
                    {
                        style: {
                            background: `url(${action.icon}) no-repeat`,
                            'background-size': '100%',
                        },
                    },
                    '',
                ),
            );
            const iconWrapper = h('div.icon-wrapper', icon);

            return h(
                'li.item',
                {
                    class: {
                        delete: action.type === 'remove-row',
                    },
                    dataset: {
                        action: action.type,
                        tooltip: i18n.t(action.tooltip),
                    },
                    attrs: {
                        title: i18n.t(action.tooltip),
                    },
                    on: {
                        click: (event) => {
                            this.selectItem(event, action);
                        },
                    },
                },
                [iconWrapper],
            );
        });

        const vnode = h('ul', children);

        if (oldVNode)
            patch(oldVNode, vnode);
        else
            patch(toolsContainer, vnode);

        this._oldVNode = vnode;
    }

    selectItem(event: Event, action: TableRowToolAction) {
        event.preventDefault();
        event.stopPropagation();

        const context = resolveTableCellContext(this._block);
        if (!context) {
            this.hide();
            return;
        }

        const { table, rowOffset: rowCount, columnOffset: columnCount } = context;
        let cursorBlock = null;

        switch (action.type) {
            case 'insert-row-above':
                cursorBlock = table.insertRow(rowCount);
                break;
            case 'insert-row-below':
                cursorBlock = table.insertRow(rowCount + 1);
                break;
            case 'append-row':
                cursorBlock = table.insertRow(table.rowCount);
                break;
            case 'move-row-up':
                cursorBlock = table.moveRow(rowCount, 'up', columnCount);
                break;
            case 'move-row-down':
                cursorBlock = table.moveRow(rowCount, 'down', columnCount);
                break;
            case 'remove-row':
                cursorBlock = table.removeRow(rowCount);
                break;
            default:
                return;
        }

        if (cursorBlock)
            cursorBlock.setCursor(0, 0);

        this.hide();
    }

    override hide() {
        this._clearShowTimer();
        this._block = null;
        clearTableHighlight(TableRowToolbar.HIGHLIGHT_OWNER);
        super.hide();
    }

    private _scheduleShow(cellElement: HTMLElement, block: TableBodyCell) {
        if (this.status && this._block === block)
            return;
        if (this._pendingCell === cellElement && this._pendingBlock === block)
            return;

        this._clearShowTimer();
        if (this.status)
            this.hide();

        this._pendingCell = cellElement;
        this._pendingBlock = block;
        this._showTimer = setTimeout(() => {
            if (this._pendingCell !== cellElement || this._pendingBlock !== block || !cellElement.isConnected)
                return;

            this._showTimer = null;
            this._pendingCell = null;
            this._pendingBlock = null;
            this._block = block;
            this._highlightCurrentRow(block);
            this.show(cellElement);
            this.render();
        }, SHOW_DELAY);
    }

    private _clearShowTimer() {
        if (this._showTimer) {
            clearTimeout(this._showTimer);
            this._showTimer = null;
        }
        this._pendingCell = null;
        this._pendingBlock = null;
    }

    private _highlightCurrentRow(block: TableBodyCell) {
        const context = resolveTableCellContext(block);
        if (!context)
            return;

        setTableHighlight(
            TableRowToolbar.HIGHLIGHT_OWNER,
            getRowHighlightCells(context.tableElement, context.rowOffset),
        );
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
        if (!block.domNode?.isConnected) {
            this._block = null;
            return false;
        }

        const cellRect = block.domNode?.getBoundingClientRect();
        const floatRect = floatBox.getBoundingClientRect();
        if (!cellRect || !floatRect.width || !floatRect.height)
            return false;

        const left = Math.min(cellRect.left, floatRect.left) - 12;
        const right = Math.max(cellRect.right, floatRect.right) + 12;
        const top = Math.min(cellRect.top, floatRect.top) - 8;
        const bottom = Math.max(cellRect.bottom, floatRect.bottom) + 8;

        return x >= left && x <= right && y >= top && y <= bottom;
    }
}
