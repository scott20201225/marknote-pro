import type Format from '../block/base/format';
import type { Muya } from '../muya';
import type Selection from './index';
import type { IImageSelectionData } from './types';
import { BLOCK_DOM_PROPERTY, CLASS_NAMES } from '../config';
import { LINK_SELECTOR } from '../editor/linkMouseEvents';
import { isHTMLElement, isKeyboardEvent } from '../utils';
import { getImageInfo, getImageSrc } from '../utils/image';
import { findContentDOM } from './dom';
import { SelectionType } from './types';

class ImageSelection {
    selected: IImageSelectionData | null = null;

    constructor(private _muya: Muya, private _selection: Selection) {}

    attach(): void {
        const { eventCenter, domNode } = this._muya;
        eventCenter.attachDOMEvent(domNode, 'mousedown', this._handleMousedown);
        eventCenter.attachDOMEvent(domNode, 'click', this._handleClick);
        eventCenter.attachDOMEvent(document, 'click', this._handleDocClick);
        eventCenter.attachDOMEvent(document, 'keydown', this._handleKeydown);
    }

    clear(): void {
        this.selected = null;
    }

    private _handleDocClick = (): void => {
        this.selected = null;
    };

    private _handleMousedown = (event: Event): void => {
        const { target } = event;
        if (target instanceof Element && target.closest('.mu-image-icon-pin')) {
            event.preventDefault();
            event.stopPropagation();
        }
    };

    private _handleClick = (event: Event): void => {
        const { target } = event;
        if (!target || !(target instanceof Element))
            return;
        const imageWrapper = target.closest<HTMLElement>(`.${CLASS_NAMES.MU_INLINE_IMAGE}`);
        this.selected = null;
        if (imageWrapper)
            this._handleClickInlineImage(event, imageWrapper);
    };

    private _handleKeydown = (event: Event): void => {
        if (!isKeyboardEvent(event))
            return;

        const { key } = event;
        const { selected } = this;
        if (!selected)
            return;

        if (!selected.block.outMostBlock) {
            this.selected = null;
            return;
        }

        if (key === ' ') {
            event.preventDefault();
            this._previewSelectedImage(selected);
            return;
        }

        if (/^(?:Backspace|Delete|Enter)$/.test(key)) {
            event.preventDefault();
            const { block, ...imageInfo } = selected;
            block.deleteImage(imageInfo);
            this._selection.activate(SelectionType.TEXT);
        }
    };

    private _previewSelectedImage(selected: IImageSelectionData) {
        const { token, imageId } = selected;
        const tokenSrc = token.src || token.attrs.src || '';
        const imgSrc
            = this._muya.domNode
                .querySelector<HTMLImageElement>(`#${imageId} img`)
                ?.getAttribute('src') ?? '';
        const src = getImageSrc(tokenSrc).src || imgSrc;

        if (src) {
            this._muya.eventCenter.emit('preview-image', {
                data: src,
            });
        }
    }

    private _handleClickInlineImage(event: Event, imageWrapper: HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        const { target } = event;
        if (!target || !(target instanceof Element))
            return;

        const pinContainer = target.closest('.mu-image-icon-pin');
        if (pinContainer) {
            const img = imageWrapper.querySelector('img');
            const tokenSrc = imageWrapper.getAttribute('data-raw') || '';
            const rawSrc = img?.getAttribute('src') || '';
            const width = Math.max(300, img?.naturalWidth || img?.clientWidth || 600);
            const height = Math.max(200, img?.naturalHeight || img?.clientHeight || 400);

            if (!rawSrc && !tokenSrc)
                return;

            const currentSrc = img?.currentSrc || img?.src || rawSrc;
            let contentUrl = currentSrc || rawSrc;
            try {
                if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0);
                        contentUrl = canvas.toDataURL('image/png');
                    }
                }
            }
            catch {
                contentUrl = currentSrc || rawSrc;
            }

            let markdownMeta: any;
            try {
                const imageInfo = getImageInfo(imageWrapper);
                const contentDom = findContentDOM(imageWrapper);
                const contentBlock = contentDom ? (contentDom[BLOCK_DOM_PROPERTY] as Format) : null;
                markdownMeta = {
                    blockId: contentBlock?.id,
                    raw: imageInfo.token.raw,
                    start: imageInfo.token.range?.start,
                    end: imageInfo.token.range?.end,
                    alt: imageInfo.token.attrs?.alt,
                    title: imageInfo.token.attrs?.title,
                    originalSrc: imageInfo.token.attrs?.src,
                    resolvedSrc: rawSrc,
                };
            }
            catch (err) {
                console.warn('[ImageSelection] Failed to extract markdownMeta for pin:', err);
            }

            if ((window as any).electron?.ipcRenderer?.invoke) {
                (window as any).electron.ipcRenderer.invoke('mt::pin-create', {
                    type: 'image',
                    content: contentUrl,
                    width,
                    height,
                    title: (img?.getAttribute('alt')) || imageWrapper.getAttribute('title') || 'Markdown 图片',
                    markdownMeta,
                });
            }

            return;
        }

        const deleteContainer = target.closest('.mu-image-icon-close');
        const contentDom = findContentDOM(target);

        if (!contentDom)
            return;

        const contentBlock = contentDom[BLOCK_DOM_PROPERTY] as Format;
        const imageInfo = getImageInfo(imageWrapper);

        if (deleteContainer) {
            contentBlock.deleteImage(imageInfo);

            return;
        }

        if (isHTMLElement(target) && target.tagName === 'IMG') {
            // A linked image (e.g. `[![alt](src)](href)`) renders its image
            // wrapper inside a link element. On modifier-click the link handler
            // (linkMouseEvents) opens the URL; don't also emit the image preview,
            // which would pop a viewer over the navigation (#3835). Reuse
            // linkMouseEvents' selector so every link variant is covered (plain,
            // reference, autolink, raw-HTML anchor), not just `mu-link`.
            if (
                event instanceof MouseEvent
                && (event.metaKey || event.ctrlKey)
                && !imageWrapper.closest(LINK_SELECTOR)
            ) {
                const tokenSrc = imageInfo.token.src || imageInfo.token.attrs.src || '';
                const src = getImageSrc(tokenSrc).src || target.getAttribute('src') || '';
                if (src) {
                    eventCenter.emit('format-click', {
                        event,
                        formatType: 'image',
                        data: src,
                    });
                }
            }

            const rect = imageWrapper
                .querySelector(`.${CLASS_NAMES.MU_IMAGE_CONTAINER}`)
                ?.getBoundingClientRect();
            const reference = {
                getBoundingClientRect: () => rect,
                width: imageWrapper.offsetWidth,
                height: imageWrapper.offsetHeight,
            };

            eventCenter.emit('muya-image-toolbar', {
                block: contentBlock,
                reference,
                imageInfo,
            });

            // Resolve the image container from the clicked wrapper directly.
            // Images that share the same src (and paragraph offset) render with
            // duplicate DOM ids, so a `document.querySelector('#id ...')` lookup
            // would resolve to the first occurrence and place the resize bar on
            // the wrong image.
            const imageContainer = imageWrapper.querySelector(
                `.${CLASS_NAMES.MU_IMAGE_CONTAINER}`,
            );

            eventCenter.emit('muya-transformer', {
                block: contentBlock,
                reference: imageContainer,
                imageInfo,
            });

            this._selection.selectImage(Object.assign({}, imageInfo, { block: contentBlock }));

            return;
        }

        if (
            imageWrapper.classList.contains(CLASS_NAMES.MU_EMPTY_IMAGE)
            || imageWrapper.classList.contains(CLASS_NAMES.MU_IMAGE_FAIL)
        ) {
            const rect = imageWrapper.getBoundingClientRect();
            const reference = {
                getBoundingClientRect: () => rect,
                width: imageWrapper.offsetWidth,
                height: imageWrapper.offsetHeight,
            };
            eventCenter.emit('muya-image-selector', {
                block: contentBlock,
                reference,
                imageInfo,
            });
        }
    }
}

export default ImageSelection;
