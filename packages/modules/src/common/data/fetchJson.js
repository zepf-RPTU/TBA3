/**
 * The one JSON fetch: a GET with a time limit, a non-OK answer thrown as `HttpError`.
 */

/** A response that arrived but was not OK, carrying the status so callers can branch on it. */
export class HttpError extends Error {
    /**
     * @param {string} message - The failure message, naming path and status.
     * @param {number} status
     */
    constructor(message, status) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}

/**
 * How long one document may take, body included, before the load fails. Without a limit
 * a server that accepts the connection and never answers keeps the skeleton up forever.
 */
export const FETCH_TIMEOUT_MS = 30_000;

/**
 * Fetch a JSON document, failing on a non-OK status or after `FETCH_TIMEOUT_MS`.
 * @param {string|URL} path - An absolute URL, or a path relative to `baseUrl`.
 * @param {string|URL} [baseUrl] - Base the path resolves against; required unless the path is absolute.
 * @returns {Promise<unknown>}
 * @throws {HttpError} When the server answered with a non-OK status.
 * @throws {DOMException} Named `TimeoutError` when the document took longer than `FETCH_TIMEOUT_MS`.
 */
export async function fetchJson(path, baseUrl) {
    const response = await fetch(new URL(path, baseUrl), {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
        throw new HttpError(
            `Failed to load ${path}: ${response.status} ${response.statusText}`,
            response.status,
        );
    }
    return response.json();
}
