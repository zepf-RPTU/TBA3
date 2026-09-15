// @vitest-browser

/**
 * The MA chart-host swap seam.
 *
 * Replacing a chart host means destroying one module and mounting the next into the
 * same container. That was written three times — the ring grid, the chart-only grid
 * and the focus chart — each still carrying the save-and-reinsert dance from when
 * `destroy()` detached the container, and two of the three had no guard against a
 * second request arriving while the first was between destroy and re-init.
 *
 * These tests pin the seam that replaced them: which of the cheap paths the probe
 * takes, that a rebuild puts the container back exactly where it was, and that a
 * superseded swap mounts nothing at all. The rebuild and abort cases drive the
 * probe explicitly so they test the seam's own behaviour rather than the probe's.
 *
 * Real `BaseModule` owner and real `ChartHostModule` throughout — the seam reaches
 * into `owner.resources` for its timeout and disposable, and a fake owner would
 * pin the fake rather than the contract. Fake renderers per the
 * chartHostLifecycle.test.js recipe; `waitForStableLayout: false` short-circuits
 * the rAF/font plumbing.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseModule } from '@tba3/module-base/modules/baseModule.js';
import { ChartHostModule } from '@tba3/modules/common/charts/host/chartHostModule.js';
import {
    remountChartHost,
    updateTaskRingHostIfReusable,
} from '@tba3/modules/ma/modules/charts/taskRing/taskRingHostUtils.js';

const HOST_OPTIONS = { waitForStableLayout: false };

const makeFakeRenderer = () => ({
    create: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
});

/**
 * A host container with a sibling after it, so a rebuild's re-insertion has a
 * position to get wrong.
 */
function makeDom(id) {
    const parent = document.createElement('div');
    const container = document.createElement('section');
    container.id = id;
    const sentinel = document.createElement('aside');
    parent.append(container, sentinel);
    document.body.appendChild(parent);
    return { parent, container, sentinel };
}

const makeOwner = () => new BaseModule('owner', document.body);

/** Task-ring-shaped data; the default probe compares these arrays by identity. */
const makeData = (overrides = {}) => ({
    itemArray: [{ iqbId: 'i1' }],
    studentArray: [{ studentId: 's1' }],
    domains: [{ domain: 'zo' }],
    selectedStudents: [],
    ...overrides,
});

async function mountHost(owner, id, container, data) {
    const renderer = makeFakeRenderer();
    const host = new ChartHostModule(
        id,
        container,
        { createRenderer: () => renderer },
        HOST_OPTIONS,
    );
    await host.init(data);
    owner.registerChildModule(host);
    return { host, renderer };
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('remountChartHost — the reuse ladder', () => {
    it('leaves a live host untouched when nothing about the data changed', async () => {
        // A rebuild here would throw away the user's selected domain and re-animate
        // every ring for a picture identical to the one already on screen.
        const owner = makeOwner();
        const { container } = makeDom('grid');
        const data = makeData();
        const { host, renderer } = await mountHost(owner, 'grid', container, data);

        const result = await remountChartHost({
            owner,
            module: host,
            data: makeData({
                itemArray: data.itemArray,
                studentArray: data.studentArray,
                domains: data.domains,
            }),
            containerId: 'grid',
            config: { createRenderer: () => makeFakeRenderer() },
            reuseProbe: updateTaskRingHostIfReusable,
            moduleOptions: HOST_OPTIONS,
        });

        expect(result.status).toBe('noop');
        expect(result.module).toBe(host);
        expect(renderer.destroy).not.toHaveBeenCalled();
    });

    it('takes the selection-only fast path instead of a full update', async () => {
        // `updateSelectedStudentsOptimized` is bound onto the host by the grid config,
        // so the probe duck-types it rather than importing a type it cannot see.
        const owner = makeOwner();
        const { container } = makeDom('grid');
        const data = makeData();
        const { host } = await mountHost(owner, 'grid', container, data);
        const optimized = vi.fn(() => true);
        /** @type {any} */ (host).updateSelectedStudentsOptimized = optimized;
        const update = vi.spyOn(host, 'update');

        const result = await remountChartHost({
            owner,
            module: host,
            data: makeData({
                itemArray: data.itemArray,
                studentArray: data.studentArray,
                domains: data.domains,
                selectedStudents: ['s1'],
            }),
            containerId: 'grid',
            config: { createRenderer: () => makeFakeRenderer() },
            reuseProbe: updateTaskRingHostIfReusable,
            moduleOptions: HOST_OPTIONS,
        });

        expect(result.status).toBe('selected-students');
        expect(optimized).toHaveBeenCalledWith(['s1']);
        expect(update).not.toHaveBeenCalled();
    });

    it('updates in place when the core data changed, keeping the same host', async () => {
        const owner = makeOwner();
        const { container, parent, sentinel } = makeDom('grid');
        const renderer = makeFakeRenderer();
        const onUpdate = vi.fn();
        const host = new ChartHostModule(
            'grid',
            container,
            { createRenderer: () => renderer, onUpdate },
            HOST_OPTIONS,
        );
        await host.init(makeData());
        owner.registerChildModule(host);
        const update = vi.spyOn(host, 'update');

        const result = await remountChartHost({
            owner,
            module: host,
            data: makeData({ itemArray: [{ iqbId: 'i2' }] }),
            containerId: 'grid',
            config: { createRenderer: () => makeFakeRenderer() },
            reuseProbe: updateTaskRingHostIfReusable,
            moduleOptions: HOST_OPTIONS,
        });

        expect(result.status).toBe('update');
        expect(result.module).toBe(host);
        expect(update).toHaveBeenCalledTimes(1);
        expect(onUpdate).toHaveBeenCalledTimes(1);
        // Untouched DOM: an in-place update must not disturb the layout around it.
        expect(parent.children[0]).toBe(container);
        expect(container.nextSibling).toBe(sentinel);
    });
});

describe('remountChartHost — rebuild', () => {
    it('hands the same container to the new host, emptied and still in position', async () => {
        // The three copies this seam replaced each saved the container's parent and
        // nextSibling and re-inserted it, because destroy() used to detach it. Since
        // 25a5d29b (2026-07-27) BaseModule empties an adopted container instead, so
        // the node survives — this pins that the rebuild reuses it in place rather
        // than mounting the new host somewhere else.
        const owner = makeOwner();
        const { container, parent, sentinel } = makeDom('grid');
        const { host, renderer } = await mountHost(owner, 'grid', container, makeData());

        const nextRenderer = makeFakeRenderer();
        const result = await remountChartHost({
            owner,
            module: host,
            data: makeData(),
            containerId: 'grid',
            config: { createRenderer: () => nextRenderer },
            moduleOptions: HOST_OPTIONS,
            reuseProbe: async () => 'rebuild',
            cleanupDelay: 0,
        });

        expect(result.status).toBe('rebuild');
        expect(result.module).not.toBe(host);
        expect(renderer.destroy).toHaveBeenCalledTimes(1);
        expect(result.module?.container).toBe(container);
        expect(parent.children[0]).toBe(container);
        expect(container.nextSibling).toBe(sentinel);
        expect(nextRenderer.create).toHaveBeenCalledTimes(1);
    });

    it('registers the new host on the owner so teardown still cascades', async () => {
        const owner = makeOwner();
        const { container } = makeDom('grid');
        const { host } = await mountHost(owner, 'grid', container, makeData());

        const nextRenderer = makeFakeRenderer();
        const { module } = await remountChartHost({
            owner,
            module: host,
            data: makeData(),
            containerId: 'grid',
            config: { createRenderer: () => nextRenderer },
            moduleOptions: HOST_OPTIONS,
            reuseProbe: async () => 'rebuild',
            cleanupDelay: 0,
        });

        expect(module?.destroyed).toBe(false);
        owner.destroy();
        expect(nextRenderer.destroy).toHaveBeenCalledTimes(1);
    });

    it('clears an empty-state placeholder out of the container first', async () => {
        // A Leitidee-less render writes "Keine Leitideen verfügbar" straight into the
        // host container with no module mounted. Without the clear, the next real
        // render builds its shell alongside that paragraph instead of replacing it.
        const owner = makeOwner();
        const { container } = makeDom('grid');
        container.innerHTML = '<p class="task-ring-empty-state">Keine Leitideen verfügbar</p>';

        const { status } = await remountChartHost({
            owner,
            module: null,
            data: makeData(),
            containerId: 'grid',
            config: { createRenderer: () => makeFakeRenderer() },
            reuseProbe: updateTaskRingHostIfReusable,
            moduleOptions: HOST_OPTIONS,
            cleanupDelay: 0,
        });

        expect(status).toBe('rebuild');
        expect(container.querySelector('.task-ring-empty-state')).toBeNull();
    });

    it('reports missing-container rather than throwing when the host node is gone', async () => {
        const owner = makeOwner();

        const result = await remountChartHost({
            owner,
            module: null,
            data: makeData(),
            containerId: 'never-rendered',
            config: { createRenderer: () => makeFakeRenderer() },
            reuseProbe: updateTaskRingHostIfReusable,
            moduleOptions: HOST_OPTIONS,
            cleanupDelay: 0,
        });

        expect(result).toEqual({ module: null, status: 'missing-container' });
    });
});

describe('remountChartHost — a superseded swap', () => {
    it('mounts nothing when a newer request arrived during the cleanup delay', async () => {
        // This is the guard the chart-only grid and the focus chart did not have:
        // without it the stale swap mounts a host for a domain the user has left.
        const owner = makeOwner();
        const { container } = makeDom('grid');
        const { host } = await mountHost(owner, 'grid', container, makeData());
        const createRenderer = vi.fn(() => makeFakeRenderer());

        const result = await remountChartHost({
            owner,
            module: host,
            data: makeData(),
            containerId: 'grid',
            config: { createRenderer },
            moduleOptions: HOST_OPTIONS,
            reuseProbe: async () => 'rebuild',
            cleanupDelay: 0,
            hasPendingRequest: () => true,
        });

        expect(result).toEqual({ module: null, status: 'aborted' });
        expect(createRenderer).not.toHaveBeenCalled();
    });

    it('abandons the swap when the view was already gone before it started', async () => {
        // A destroyed view's resource tracker no longer schedules timeouts, so without
        // the early check the swap would wait on a timer that never fires and the
        // caller's await would never settle.
        const owner = makeOwner();
        const { container } = makeDom('grid');
        const { host } = await mountHost(owner, 'grid', container, makeData());
        const createRenderer = vi.fn(() => makeFakeRenderer());
        owner.destroy();

        const pending = remountChartHost({
            owner,
            module: host,
            data: makeData(),
            containerId: 'grid',
            config: { createRenderer },
            moduleOptions: HOST_OPTIONS,
            reuseProbe: async () => 'rebuild',
            cleanupDelay: 10_000,
        });

        // Racing a short marker is the assertion: a destroyed tracker still schedules
        // the timeout but will never clear it, so skipping the early check does not
        // fail loudly — it waits out the full delay.
        const stillWaiting = new Promise((resolve) =>
            setTimeout(() => resolve('still-waiting'), 50),
        );
        expect(await Promise.race([pending, stillWaiting])).toEqual({
            module: null,
            status: 'aborted',
        });
        expect(createRenderer).not.toHaveBeenCalled();
    });

    it('abandons the swap when the view is torn down mid-flight', async () => {
        // The delay runs on the owner's resource tracker. If teardown did not release
        // it, this promise would either hang past the view's life or mount a host into
        // a destroyed view.
        const owner = makeOwner();
        const { container } = makeDom('grid');
        const { host } = await mountHost(owner, 'grid', container, makeData());
        const createRenderer = vi.fn(() => makeFakeRenderer());

        const pending = remountChartHost({
            owner,
            module: host,
            data: makeData(),
            containerId: 'grid',
            config: { createRenderer },
            moduleOptions: HOST_OPTIONS,
            reuseProbe: async () => 'rebuild',
            cleanupDelay: 10_000,
        });

        // Nothing has awaited the delay yet; tearing the view down must release it.
        await Promise.resolve();
        owner.destroy();

        expect(await pending).toEqual({ module: null, status: 'aborted' });
        expect(createRenderer).not.toHaveBeenCalled();
    });
});
