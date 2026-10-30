/**
 * Each fixture folder goes through the DocumentStore pipeline that serves the
 * dashboards (split, validate, freeze), so a fixture edit that breaks the data
 * contract fails here, not in a chart.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DocumentStore, GROUP_REQUESTS, SCHOOL_REQUESTS } from '@tba3/modules/documents';

const DATA_ROOT = path.resolve('public/data');

/** @type {import('@tba3/modules/documents').DatasetRequest} */
const INFO_BOXES_REQUEST = { file: 'info-boxes.json', documents: ['info-boxes.json'] };

/**
 * @param {string} folder
 * @returns {(request: import('@tba3/modules/documents').DatasetRequest) => Promise<unknown>}
 */
const folderLoader = (folder) => async (request) =>
    JSON.parse(readFileSync(path.join(folder, request.file), 'utf8'));

/**
 * @param {'en'|'ma'|'sl'} app
 * @returns {string[]}
 */
const datasetFolders = (app) =>
    readdirSync(path.join(DATA_ROOT, app), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(DATA_ROOT, app, entry.name));

/** @typedef {[folder: string, requests: import('@tba3/modules/documents').DatasetRequest[]]} Fixture */

/** @type {Fixture[]} */
const FIXTURES = [
    .../** @type {const} */ (['en', 'ma']).flatMap((app) =>
        datasetFolders(app).map((folder) => /** @type {Fixture} */ ([folder, GROUP_REQUESTS[app]])),
    ),
    ...datasetFolders('sl').map((folder) => /** @type {Fixture} */ ([folder, SCHOOL_REQUESTS])),
    [path.join(DATA_ROOT, 'sl'), [INFO_BOXES_REQUEST]],
];

describe('the committed fixtures', () => {
    it.each(FIXTURES)('%s has the shape the dashboards read', async (folder, requests) => {
        const store = new DocumentStore({ requests, loadRequest: folderLoader(folder) });

        await expect(store.ensureAll()).resolves.toBeUndefined();
    });
});
