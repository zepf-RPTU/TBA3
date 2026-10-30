// @vitest-browser
/**
 * `getApiBaseUrl()`: the `?api=` override lets a link redirect every dataset fetch, and
 * the glossary popups render payload text as HTML, so the override is held to the
 * page's own origin or a loopback host. Anything else fails loudly instead of reading
 * like a server outage.
 */

import { afterEach, describe, it, expect, vi } from 'vitest';

import {
    ApiUnreachableError,
    fetchApiJson,
    getApiBaseUrl,
} from '../../../../src/common/services/apiClient.js';

/**
 * The API base with the page at a query string, as a link would open it.
 * @param {string} search
 * @returns {URL} What `getApiBaseUrl` reads off it.
 */
function apiBaseAt(search) {
    history.replaceState(null, '', `${window.location.pathname}${search}`);
    return getApiBaseUrl();
}

describe('getApiBaseUrl', () => {
    const original = window.location.href;
    afterEach(() => history.replaceState(null, '', original));

    it('defaults to the same-origin api/ under the site base', () => {
        const base = apiBaseAt('');
        expect(base.origin).toBe(window.location.origin);
        expect(base.pathname.endsWith('/api/')).toBe(true);
    });

    it('accepts a loopback override on any port', () => {
        expect(apiBaseAt('?api=http://127.0.0.1:9000').href).toBe('http://127.0.0.1:9000/');
        expect(apiBaseAt('?api=http://localhost:8000/api').href).toBe('http://localhost:8000/api');
    });

    it('rejects the IPv6 loopback, which the CSP cannot allow', () => {
        expect(() => apiBaseAt('?api=http://[::1]:8000/')).toThrow(/rejected/);
    });

    it("accepts the page's own origin", () => {
        const own = `${window.location.origin}/elsewhere/api`;
        expect(apiBaseAt(`?api=${encodeURIComponent(own)}`).href).toBe(own);
    });

    it('rejects a foreign origin', () => {
        expect(() => apiBaseAt('?api=https://evil.example/')).toThrow(/rejected/);
    });

    it('rejects a scheme other than http(s), even on localhost', () => {
        expect(() => apiBaseAt('?api=ftp://localhost/')).toThrow(/rejected/);
        expect(() => apiBaseAt('?api=javascript:alert(1)')).toThrow(/rejected/);
    });

    it('rejects a value that is not a URL', () => {
        expect(() => apiBaseAt('?api=not-a-url')).toThrow(/not a URL/);
    });
});

describe('fetchApiJson', () => {
    it('reports a request that timed out as an unreachable API', async () => {
        // The bootstrap shows its "Datenquelle nicht erreichbar" callout only for
        // ApiUnreachableError; a bare TimeoutError would read as a generic failure.
        vi.stubGlobal('fetch', async () => {
            throw new DOMException('signal timed out', 'TimeoutError');
        });

        const error = await fetchApiJson(new URL('http://127.0.0.1:8000/x')).catch((e) => e);
        expect(error).toBeInstanceOf(ApiUnreachableError);
        expect(/** @type {ApiUnreachableError} */ (error).message).toMatch(/within 30 s/);
    });
});
