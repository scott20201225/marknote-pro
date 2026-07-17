import type { VNode } from 'snabbdom';
import type CellBlock from '../../block/gfm/table/cell';
import type { Muya } from '../../index';
import type { TableColumnToolIcon } from './config';
import { BLOCK_DOM_PROPERTY } from '../../config';
import { isMouseEvent, throttle } from '../../utils';
import { h, patch } from '../../utils/snabbdom';
import BaseFloat from '../baseFloat';
import { resolveTableCellContext } from '../tableContext';
import { clearTableHighlight, getColumnHighlightCells, setTableHighlight } from '../tableHighlight';
import icons from './config';

import './index.css';

const OFFSET = 27;
const SHOW_DELAY = 500;

const defaultOptions = {
    placement: 'top' as const,
    offsetOptions: {
        mainAxis: 0,
        crossAxis: 0,
        alignmentAxis: 0,
    },
    showArrow: false,
};

export class TableColumnToolbar extends BaseFloat {
    private static readonly HIGHLIGHT_OWNER = 'table-column-toolbar';
    private _oldVNode: VNode | null = null;
    private _block: CellBlock | null = null;
    private _showTimer: ReturnType<typeof setTimeout> | null = null;
    private _pendingCell: HTMLElement | null = null;
    private _pendingBlock: CellBlock | null = null;
    private _icons: TableColumnToolIcon[] = icons;
    private _toolsContainer: HTMLDivElement = document.createElement('div');

    static pluginName = 'tableColumnTools';
    public override capturesContentKeydown = true;

    constructor(muya: Muya, options = {}) {
        const name = 'mu-table-column-tools';
        const opts = Object.assign({}, defaultOptions, options);
        super(muya, name, opts);
        this.options = opts;
        this.container!.appendChild(this._toolsContainer);
        this.floatBox!.classList.add('mu-table-column-tools-container');
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
            const bellowEles = [...document.elementsFromPoint(x, y + OFFSET)];
            if (this._isHoveringSelf(eles) || this._isInsideHoverBridge(x, y))
                return;

            const hasTableCell = (eles: Element[]) => {
                return eles.some(
                    ele =>
                        ele[BLOCK_DOM_PROPERTY]
                        && ele[BLOCK_DOM_PROPERTY].blockName === 'table.cell',
                );
            };

            if (!hasTableCell(eles) && hasTableCell(bellowEles)) {
                // No need to show table column tools when format tool bar is shown. or the table column tools will show on the top of format toolbar.
                const { ui } = this.muya;
                for (const { name, status } of ui.shownFloat) {
                    if (name === 'mu-format-picker' && status)
                        return this.hide();
                }
                const tableCellEle = bellowEles.find(
                    ele =>
                        ele[BLOCK_DOM_PROPERTY]
                        && ele[BLOCK_DOM_PROPERTY].blockName === 'table.cell',
                );
                const cellBlock = tableCellEle![BLOCK_DOM_PROPERTY];
                this._scheduleShow(tableCellEle as HTMLElement, cellBlock as CellBlock);
            }
            else {
                this._clearShowTimer();
                this.hide();
            }
        });

        eventCenter.attachDOMEvent(document.body, 'mousemove', handler);
        eventCenter.attachDOMEvent(this.container!, 'mouseenter', () => {
            if (this._block)
                this._highlightCurrentColumn(this._block);
        });
        eventCenter.attachDOMEvent(this.container!, 'mouseleave', () => {
            clearTableHighlight(TableColumnToolbar.HIGHLIGHT_OWNER);
        });
    }

    render() {
        const { _icons: icons, _oldVNode: oldVNode, _toolsContainer: toolsContainer, _block: block } = this;
        const { i18n } = this.muya;
        const children = icons.map((i) => {
            const iconWrapperSelector = 'div.icon-wrapper';
            const icon = h(
                'i.icon',
                h(
                    'i.icon-inner',
                    {
                        style: {
                            'background': `url(${i.icon}) no-repeat`,
                            'background-size': '100%',
                        },
                    },
                    '',
                ),
            );
            const iconWrapper = h(iconWrapperSelector, icon);

            return h(
                'li.item',
                {
                    class: {
                        active: block?.align === i.type,
                        'with-divider': !!i.dividerBefore,
                        delete: i.type === 'remove',
                    },
                    dataset: {
                        action: i.type,
                        tooltip: i18n.t(i.tooltip),
                    },
                    attrs: {
                        title: `${i18n.t(i.tooltip)}`,
                    },
                    on: {
                        click: (event) => {
                            this.selectItem(event, i);
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

    selectItem(event: Event, item: TableColumnToolIcon) {
        event.preventDefault();
        event.stopPropagation();

        const context = resolveTableCellContext(this._block);
        if (!context) {
            this.hide();
            return;
        }

        const { table, rowOffset: rowCount, columnOffset: columnCount, block } = context;
        const offset = columnCount;
        let cursorBlock = null;

        switch (item.type) {
            case 'remove': {
                // removeColumn returns a content block to re-anchor the caret
                // on (inside the table
                // if columns remain, outside the table if the whole table was
                // removed). Without this setCursor the caret stays in the
                // detached cell.
                cursorBlock = table.removeColumn(offset);
                break;
            }

            case 'insert left':
                // fall through
            case 'insert right': {
                const offset
                    = item.type === 'insert left' ? columnCount : columnCount + 1;
                cursorBlock = table.insertColumn(offset);
                break;
            }

            case 'append':
                cursorBlock = table.insertColumn(table.columnCount);
                break;

            case 'move left':
                cursorBlock = table.moveColumn(columnCount, 'left', rowCount);
                break;

            case 'move right':
                cursorBlock = table.moveColumn(columnCount, 'right', rowCount);
                break;

            default:
                table.alignColumn(offset, item.type);
                this._highlightCurrentColumn(block);
                return this.render();
        }

        if (cursorBlock)
            cursorBlock.setCursor(0, 0);

        return this.hide();
    }

    override hide() {
        this._clearShowTimer();
        this._block = null;
        clearTableHighlight(TableColumnToolbar.HIGHLIGHT_OWNER);
        super.hide();
    }

    private _scheduleShow(cellElement: HTMLElement, block: CellBlock) {
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
            this._highlightCurrentColumn(block);
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

    private _highlightCurrentColumn(block: CellBlock) {
        const context = resolveTableCellContext(block);
        if (!context)
            return;

        setTableHighlight(
            TableColumnToolbar.HIGHLIGHT_OWNER,
            getColumnHighlightCells(context.tableElement, context.columnOffset),
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
