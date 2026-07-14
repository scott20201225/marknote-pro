import { describe, expect, it, vi } from 'vitest';
import Content from '../content';

describe('content.setCursor on detached content', () => {
    it('returns quietly when the content has no live parent chain', () => {
        const selection = { setSelection: vi.fn() };
        const fakeThis = {
            parent: null,
            outMostBlock: null,
            muya: { editor: { activeContentBlock: null } },
            selection,
            update: vi.fn(),
        };

        expect(() =>
            Content.prototype.setCursor.call(
                fakeThis as unknown as Content,
                0,
                0,
                true,
            ),
        ).not.toThrow();

        expect(fakeThis.update).not.toHaveBeenCalled();
        expect(selection.setSelection).not.toHaveBeenCalled();
    });
});
