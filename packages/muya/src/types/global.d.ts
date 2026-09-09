import type Content from '../block/base/content';
import type Parent from '../block/base/parent';

declare global {
    // eslint-disable-next-line ts/naming-convention
    interface Window {
        Prism: unknown;
        MUYA_VERSION: string;
        // Absolute directory of the document currently open in the host
        // (desktop) app. `getImageSrc` reads it to anchor relative local
        // image paths. Undefined in
        // non-desktop / headless contexts (the resolver then leaves relative
        // paths untouched rather than producing a broken `file://`).
        DIRNAME?: string;
    }

    // eslint-disable-next-line ts/naming-convention
    interface Element {
        __MUYA_BLOCK__: Content | Parent;
    }

}
