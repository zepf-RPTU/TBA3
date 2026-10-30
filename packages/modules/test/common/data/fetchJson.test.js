import { describe, expect, it, vi } from 'vitest';
import { fetchJson, HttpError } from '../../../src/common/data/fetchJson.js';
import { required } from '../../support/required.js';

describe('fetchJson', () => {
    it('bounds every request with a timeout signal', async () => {
        // A server that accepts the connection and never answers would otherwise
        // keep the cold-start skeleton up forever.
        const fetch = vi.fn(
            /** @type {(input: string | URL, init?: RequestInit) => Promise<Response>} */ (
                async () => new Response('{"ok":true}')
            ),
        );
        vi.stubGlobal('fetch', fetch);

        await expect(fetchJson('data/x.json', 'http://example.test/')).resolves.toEqual({
            ok: true,
        });
        const [, init] = fetch.mock.calls[0];
        expect(required(init).signal).toBeInstanceOf(AbortSignal);
    });

    it('fails a non-OK answer with its status', async () => {
        vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));

        await expect(fetchJson('data/x.json', 'http://example.test/')).rejects.toBeInstanceOf(
            HttpError,
        );
    });
});
