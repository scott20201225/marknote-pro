import type { Muya } from '../../../muya';
import type { IOrderListState } from '../../../state/types';
import type ListItem from '../listItem';
import { CLASS_NAMES } from '../../../config';
import { mixins } from '../../../utils';
import { LinkedList } from '../../base/linkedList/linkedList';
import Parent from '../../base/parent';
import IContainerQueryBlock from '../../mixins/containerQueryBlock';
import { ScrollPage } from '../../scrollPage';

@mixins(IContainerQueryBlock)
class OrderList extends Parent {
    public override children: LinkedList<Parent> = new LinkedList();
    public meta: IOrderListState['meta'];

    static override blockName = 'order-list';

    static create(muya: Muya, state: IOrderListState) {
        const orderList = new OrderList(muya, state);

        orderList.append(
            ...state.children.map(child =>
                ScrollPage.loadBlock(child.name).create(muya, child),
            ),
        );

        return orderList;
    }

    override get path() {
        const { path: pPath } = this.parent!;
        const offset = this.parent!.offset(this);

        return [...pPath, offset, 'children'];
    }

    constructor(muya: Muya, { meta }: IOrderListState) {
        super(muya);
        this.tagName = 'ol';
        this.meta = meta;
        this.attributes = { start: String(meta.start) };
        this.datasets = { delimiter: meta.delimiter };
        this.classList = [CLASS_NAMES.MU_ORDER_LIST];
        if (!meta.loose)
            this.classList.push('mu-tight-list');

        this.createDomNode();
    }

    get start(): number {
        return this.meta.start;
    }

    set start(start: number) {
        const oldStart = this.meta.start;
        if (start !== oldStart) {
            this.meta.start = start;
            this.attributes = {
                ...this.attributes,
                start: String(start),
            };
            if (this.domNode) {
                this.domNode.setAttribute('start', String(start));
            }
            if (this.parent) {
                const path = [...this.path];
                path.pop();
                path.push('meta', 'start');
                this.jsonState.replaceOperation(path, oldStart, start);
            }
        }
    }

    findPreviousOrderList(): OrderList | null {
        let prev = this.prev;
        while (prev) {
            if (prev.blockName === 'order-list') {
                return prev as OrderList;
            }
            prev = prev.prev;
        }
        return null;
    }

    continuePreviousNumbering(): boolean {
        const prevOl = this.findPreviousOrderList();
        if (prevOl) {
            const nextStart = (prevOl.meta.start || 1) + prevOl.children.length;
            this.start = nextStart;
            return true;
        }
        return false;
    }

    restartNewList(): boolean {
        if (this.meta.start !== 1) {
            this.start = 1;
            return true;
        }
        return false;
    }

    override getState(): IOrderListState {
        const state: IOrderListState = {
            name: 'order-list',
            meta: { ...this.meta },
            children: this.children.map(child => (child as ListItem).getState()),
        };

        return state;
    }
}

export default OrderList;
