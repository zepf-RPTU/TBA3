import { describe, it, expect } from 'vitest';

import { apiRequestLoader } from '../../../src/common/data/index.js';

describe('apiRequestLoader', () => {
    it('fills the request template for the scope under the base', async () => {
        /** @type {string[]} */
        const urls = [];
        const load = apiRequestLoader({
            baseUrl: 'http://api.test/v1/',
            scope: 'groups/8b',
            fetchJson: (url) => {
                urls.push(url.href);
                return Promise.resolve([]);
            },
        });

        await load({ file: 'items.json', template: '{scope}/items?domain=en', documents: [] });

        expect(urls).toEqual(['http://api.test/v1/groups/8b/items?domain=en']);
    });

    it('keeps the base path when the base lacks its trailing slash', async () => {
        // The templates are relative, so `…/v1` would resolve them against its parent
        // and send every request to `…/groups/…` without the prefix.
        /** @type {string[]} */
        const urls = [];
        const load = apiRequestLoader({
            baseUrl: 'http://api.test/v1',
            scope: 'groups/8b',
            fetchJson: (url) => {
                urls.push(url.href);
                return Promise.resolve([]);
            },
        });

        await load({ file: 'items.json', template: '{scope}/items', documents: [] });

        expect(urls).toEqual(['http://api.test/v1/groups/8b/items']);
    });

    it('refuses a scope that would leave the API base', () => {
        // The scope comes off the page URL; resolved against the base, these would reach
        // another host, a path outside the prefix or a query of their own.
        for (const scope of [
            '//evil.test/x',
            'groups/..',
            'groups/1/../../x',
            'groups/1?a=b',
            'users/1',
        ]) {
            expect(
                () => apiRequestLoader({ baseUrl: 'http://api.test/v1/', scope }),
                scope,
            ).toThrow(/is not a scope/);
        }
    });

    it('refuses a request the host serves itself', () => {
        // Info-boxes.json is a site file with no API template; sending it to the API
        // would 404 with no hint that the host's loader was supposed to answer it.
        const load = apiRequestLoader({ baseUrl: 'http://api.test/', scope: 'schools/1' });

        expect(() => load({ file: 'info-boxes.json', site: 'data/sl/', documents: [] })).toThrow(
            /served by the host \(data\/sl\/\)/,
        );
    });
});
