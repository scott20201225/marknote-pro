import { describe, expect, it } from 'vitest';
import { buildReferenceLabelRegExp } from '../index';

describe('buildReferenceLabelRegExp', () => {
    it('escapes special characters in reference labels', () => {
        const reg = buildReferenceLabelRegExp('[link\\');

        expect(reg.test('use [[link\\] here')).toBe(true);
        expect(reg.test('[[link\\]: https://example.com')).toBe(false);
    });

    it('matches plain reference labels unchanged', () => {
        const reg = buildReferenceLabelRegExp('link');

        expect(reg.test('[link]')).toBe(true);
        expect(reg.test('[link]: https://example.com')).toBe(false);
    });
});
