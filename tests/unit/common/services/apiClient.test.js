// @vitest-browser
/**
 * `getApiBaseUrl()`: the `?api=` override is the one place a link can redirect every
 * dataset fetch, and the glossary popups render payload text as HTML — so the override
 * is held to the page's own origin or a loopback host, and anything else fails loudly
 * instead of reading like a server outage.
 */

import { describe, it, expect } from 'vitest';

import { getApiBaseUrl } from '../../../../src/common/services/apiClient.js';

describe('getApiBaseUrl', () => {
    it('defaults to the same-origin api/ under the site base', () => {
        const base = getApiBaseUrl('');
        expect(base.origin).toBe(window.location.origin);
        expect(base.pathname.endsWith('/api/')).toBe(true);
    });

    it('accepts a loopback override on any port and appends the trailing slash', () => {
        expect(getApiBaseUrl('?api=http://127.0.0.1:9000').href).toBe('http://127.0.0.1:9000/');
        expect(getApiBaseUrl('?api=http://localhost:8000/api').href).toBe(
            'http://localhost:8000/api/',
        );
        expect(getApiBaseUrl('?api=http://[::1]:8000/').href).toBe('http://[::1]:8000/');
    });

    it("accepts the page's own origin", () => {
        const own = `${window.location.origin}/elsewhere/api`;
        expect(getApiBaseUrl(`?api=${encodeURIComponent(own)}`).href).toBe(`${own}/`);
    });

    it('rejects a foreign origin', () => {
        expect(() => getApiBaseUrl('?api=https://evil.example/')).toThrow(/rejected/);
    });

    it('rejects a scheme other than http(s), even on localhost', () => {
        expect(() => getApiBaseUrl('?api=ftp://localhost/')).toThrow(/rejected/);
        expect(() => getApiBaseUrl('?api=javascript:alert(1)')).toThrow(/rejected/);
    });

    it('rejects a value that is not a URL', () => {
        expect(() => getApiBaseUrl('?api=not-a-url')).toThrow(/not a URL/);
    });
});
