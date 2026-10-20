import type { Muya } from '../../../muya';
import type { IDiagramState, TState } from '../../../state/types';
import { fromEvent } from 'rxjs';
import { CLASS_NAMES, PREVIEW_DOMPURIFY_CONFIG } from '../../../config';
import { sanitize } from '../../../utils';
import loadRenderer from '../../../utils/diagram';
import logger from '../../../utils/logger';
import Parent from '../../base/parent';
import { DIAGRAM_ICONS } from './diagramIcons';

const debug = logger('diagramPreview:');

// Give a fixed-size `<svg>` (one with `width`/`height` px attributes but no
// `viewBox`) a viewBox derived from those dimensions, so `max-width: 100%`
// scales it down to fit instead of clipping it. Returns true once applied.
function addViewBox(target: HTMLElement): boolean {
    const svg = target.querySelector('svg');
    if (!svg || svg.getAttribute('viewBox'))
        return !!svg;
    const width = Number.parseFloat(svg.getAttribute('width') ?? '');
    const height = Number.parseFloat(svg.getAttribute('height') ?? '');
    if (width > 0 && height > 0) {
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        return true;
    }
    return false;
}

// `drawSVG` (js-sequence-diagrams / flowchart.js) renders the `<svg>`
// asynchronously — it's drawn from a theme callback after its font loads — so
// the element and its `width`/`height` attributes aren't there synchronously.
// Try once, then observe `target` until the sized `<svg>` appears.
function ensureViewBox(target: HTMLElement): void {
    if (addViewBox(target))
        return;
    const observer = new MutationObserver(() => {
        if (addViewBox(target))
            observer.disconnect();
    });
    observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['width', 'height'],
    });
    // Safety net so the observer can't leak if the svg never renders.
    setTimeout(() => observer.disconnect(), 5000);
}

interface IRenderOptions {
    type: string;
    code: string;
    target: HTMLElement;
    vegaTheme: string;
    mermaidTheme: string;
    plantumlServer: string;
    sequenceTheme: 'hand' | 'simple';
}

async function renderDiagram({
    type,
    code,
    target,
    vegaTheme,
    mermaidTheme,
    plantumlServer,
    sequenceTheme,
}: IRenderOptions) {
    const render = await loadRenderer(type);
    const options = {};
    if (type === 'vega-lite') {
        Object.assign(options, {
            actions: false,
            tooltip: false,
            renderer: 'svg',
            theme: vegaTheme,
            ast: true,
        });
    }
    else if (type === 'sequence') {
        Object.assign(options, { theme: sequenceTheme });
    }

    if (type === 'plantuml') {
        const diagram = render.parse(code, plantumlServer);
        target.innerHTML = '';
        diagram.insertImgElement(target);
    }
    else if (type === 'vega-lite') {
        await render(target, JSON.parse(code), options);
    }
    else if (type === 'flowchart' || type === 'sequence') {
        const diagram = render.parse(code);
        target.innerHTML = '';
        diagram.drawSVG(target, options);
        // js-sequence-diagrams / flowchart.js emit an <svg> with a fixed pixel
        // width/height but NO viewBox, so the `max-width: 100%` style can only
        // clip a wide diagram, not scale it. Derive a viewBox from those pixel
        // dimensions (once the async draw completes) so it scales to fit.
        ensureViewBox(target);
    }
    else if (type === 'mermaid') {
        render.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: mermaidTheme,
        });
        await render.parse(code);
        target.innerHTML = sanitize(code, PREVIEW_DOMPURIFY_CONFIG, true) as string;
        target.removeAttribute('data-processed');
        await render.run({
            nodes: [target],
        });
    }
}

class DiagramPreview extends Parent {
    private _code: string;
    private _type: string;
    private _viewerCleanup?: () => void;
    private _justDragged: boolean = false;
    static override blockName = 'diagram-preview';

    static create(muya: Muya, state: IDiagramState) {
        const diagramPreview = new DiagramPreview(muya, state);

        return diagramPreview;
    }

    override get path() {
        debug.warn('You can never call `get path` in diagramPreview');
        return [];
    }

    constructor(muya: Muya, { text, meta }: IDiagramState) {
        super(muya);
        this.tagName = 'div';
        this._code = text;
        this._type = meta.type;
        this.classList = ['mu-diagram-preview'];
        this.attributes = {
            spellcheck: 'false',
            contenteditable: 'false',
        };
        this.createDomNode();
        this._attachDOMEvents();
        this.update();
    }

    override getState(): TState {
        debug.warn('You can never call `getState` in diagramPreview');
        return {} as TState;
    }

    private _cleanupViewer() {
        if (typeof this._viewerCleanup === 'function') {
            this._viewerCleanup();
        }
        this._viewerCleanup = undefined;
    }

    override remove(source = 'user') {
        this._cleanupViewer();
        if ((this.muya as any)?.editor?.jsonState) {
            super.remove(source);
        }
        else {
            this.domNode?.remove();
        }
        return this;
    }

    private _attachDOMEvents() {
        const clickObservable = fromEvent(this.domNode!, 'click');
        clickObservable.subscribe(this.clickHandler.bind(this));
    }

    clickHandler(event: Event) {
        event.preventDefault();
        event.stopPropagation();

        if (this._justDragged) {
            this._justDragged = false;
            return;
        }

        if (this.domNode?.closest('.mu-read-only') || (this.muya as any)?.options?.readOnly) {
            return;
        }

        if (this.parent == null)
            return;

        const cursorBlock = this.parent.firstContentInDescendant();
        cursorBlock?.setCursor(0, 0);
    }

    private _attachDiagramViewer() {
        this._cleanupViewer();

        const target = this.domNode;
        if (!target)
            return;

        const svg = target.querySelector('svg');
        if (!svg)
            return;

        target.classList.add('mu-diagram-interactive');
        svg.classList.add('mu-diagram-svg');

        let scale = 1;
        let x = 0;
        let y = 0;
        let isExpanded = false;

        const applyTransform = (smooth = false) => {
            svg.style.transition = smooth ? 'transform 0.15s ease-out' : 'none';
            svg.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
        };

        const zoom = (delta: number) => {
            scale = Math.min(Math.max(0.2, Number.parseFloat((scale + delta).toFixed(2))), 8);
            applyTransform(true);
        };

        const pan = (dx: number, dy: number) => {
            x += dx;
            y += dy;
            applyTransform(true);
        };

        const reset = () => {
            scale = 1;
            x = 0;
            y = 0;
            isExpanded = false;
            fitBtn?.classList.remove('active');
            applyTransform(true);
        };

        const panel = document.createElement('div');
        panel.className = 'mermaid-viewer-control-panel';
        panel.setAttribute('contenteditable', 'false');

        panel.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        panel.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
        });

        const createBtn = (
            className: string,
            svgIcon: string,
            onClick: () => void,
            label: string,
        ) => {
            const btn = document.createElement('button');
            btn.className = `btn ${className}`;
            btn.setAttribute('type', 'button');
            btn.setAttribute('aria-label', label);
            btn.setAttribute('title', label);
            btn.innerHTML = svgIcon;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                onClick();
            });
            return btn;
        };

        const fitBtn = createBtn('fit-width', DIAGRAM_ICONS.fitWidth, () => {
            isExpanded = !isExpanded;
            fitBtn.classList.toggle('active', isExpanded);
            if (isExpanded) {
                const containerWidth = target.clientWidth || 600;
                const svgRect = svg.getBoundingClientRect();
                const currentWidth = svgRect.width / scale;
                if (currentWidth > 0) {
                    scale = Math.min(Math.max(0.5, (containerWidth - 32) / currentWidth), 3);
                } else {
                    scale = 1.5;
                }
            } else {
                scale = 1;
            }
            x = 0;
            y = 0;
            applyTransform(true);
        }, '适应宽度');

        panel.appendChild(fitBtn);
        panel.appendChild(createBtn('up', DIAGRAM_ICONS.chevronUp, () => pan(0, 100), '向上平移'));
        panel.appendChild(createBtn('zoom-in', DIAGRAM_ICONS.zoomIn, () => zoom(0.2), '放大'));
        panel.appendChild(createBtn('left', DIAGRAM_ICONS.chevronLeft, () => pan(100, 0), '向左平移'));
        panel.appendChild(createBtn('reset', DIAGRAM_ICONS.reset, () => reset(), '重置视图'));
        panel.appendChild(createBtn('right', DIAGRAM_ICONS.chevronRight, () => pan(-100, 0), '向右平移'));
        panel.appendChild(createBtn('down', DIAGRAM_ICONS.chevronDown, () => pan(0, -100), '向下平移'));
        panel.appendChild(createBtn('zoom-out', DIAGRAM_ICONS.zoomOut, () => zoom(-0.2), '缩小'));

        target.appendChild(panel);

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let initialX = 0;
        let initialY = 0;
        let hasMoved = false;

        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0)
                return;
            if ((e.target as HTMLElement).closest('.mermaid-viewer-control-panel'))
                return;

            isDragging = true;
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            initialX = x;
            initialY = y;

            target.style.cursor = 'grabbing';
            svg.style.transition = 'none';

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging)
                return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.hypot(dx, dy) > 4) {
                hasMoved = true;
            }
            x = initialX + dx;
            y = initialY + dy;
            applyTransform(false);
        };

        const onMouseUp = () => {
            if (!isDragging)
                return;
            isDragging = false;
            target.style.cursor = '';
            svg.style.transition = 'transform 0.15s ease-out';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            if (hasMoved) {
                this._justDragged = true;
                setTimeout(() => {
                    this._justDragged = false;
                }, 100);
            }
        };

        const onWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                const delta = e.deltaY < 0 ? 0.15 : -0.15;
                zoom(delta);
            }
        };

        target.addEventListener('mousedown', onMouseDown);
        target.addEventListener('wheel', onWheel, { passive: false });

        this._viewerCleanup = () => {
            target.removeEventListener('mousedown', onMouseDown);
            target.removeEventListener('wheel', onWheel);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            panel.remove();
            target.classList.remove('mu-diagram-interactive', 'mu-diagram-fullwidth');
            target.style.cursor = '';
        };
    }

    async update(code = this._code) {
        const { i18n } = this.muya;
        if (this._code !== code)
            this._code = code;

        if (code) {
            this._cleanupViewer();
            this.domNode!.innerHTML = i18n.t('Loading...');
            const { mermaidTheme, vegaTheme, plantumlServer, sequenceTheme } = this.muya.options;
            const { _type: type } = this;

            try {
                await renderDiagram({
                    target: this.domNode!,
                    code,
                    type,
                    mermaidTheme,
                    vegaTheme,
                    plantumlServer,
                    sequenceTheme,
                });
                this._attachDiagramViewer();
            }
            catch (error) {
                this._cleanupViewer();
                const detail
                    = error instanceof Error ? error.message : String(error);
                debug.error(`render ${type} diagram failed: ${detail}`);
                this.domNode!.innerHTML = `<div class="mu-diagram-error">&lt; ${i18n.t(
                    'Invalid Diagram Code',
                )} &gt;<div class="mu-diagram-error-detail">${sanitize(
                    detail,
                    PREVIEW_DOMPURIFY_CONFIG,
                    true,
                )}</div></div>`;
            }
        }
        else {
            this._cleanupViewer();
            this.domNode!.innerHTML = `<div class="${CLASS_NAMES.MU_EMPTY}">&lt; ${i18n.t(
                'Empty Diagram',
            )} &gt;</div>`;
        }
    }
}

export default DiagramPreview;
