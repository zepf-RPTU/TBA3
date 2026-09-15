// @vitest-browser

/**
 * TaskRingGridController — creation-request supersession.
 *
 * create() defers the grid build to a requestAnimationFrame callback. A view or
 * mode switch can issue a second create(), an empty-data create(), or cleanup()
 * before that frame fires; the first callback must then draw nothing — otherwise
 * two grids land in one container, or a torn-down host gets a grid. The controller
 * keeps the current request id itself, so the rule is assertable against a bare
 * fake host: the live render path reads the host's container, a superseded one
 * never gets that far.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTaskRingGridController } from '@tba3/modules/ma/modules/charts/taskRing/taskRingGridController.js';

const itemArray = [{ iqbId: 'i1', domain: 'zo', competenceLevel: 'II', percentageCorrect: 50 }];
const domains = [{ domain: 'zo', domainLabel: 'Zahlen und Operationen' }];
const fullData = { itemArray, studentArray: [], domains };
const emptyData = { itemArray: [], studentArray: [], domains };

/** A host whose container reads are counted; `getOption` answers nothing. */
function makeHost() {
    const container = document.createElement('div');
    container.id = 'ring-grid';
    document.body.appendChild(container);
    return {
        id: 'ring-grid',
        configState: {},
        destroyed: false,
        charts: [],
        containerReads: 0,
        getOption: () => undefined,
        get contentContainer() {
            this.containerReads += 1;
            return container;
        },
    };
}

describe('TaskRingGridController — a newer creation request supersedes a pending one', () => {
    /** @type {Array<() => void>} */
    let frames;

    beforeEach(() => {
        frames = [];
        vi.stubGlobal('requestAnimationFrame', (cb) => {
            frames.push(cb);
            return frames.length;
        });
        // The live path goes on to draw with d3 surface the stub does not cover; the
        // controller catches that and resolves []. Reaching the throw is the proof
        // the request was still live, so the log is silenced, not asserted away.
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('lets only the newest of two back-to-back create() calls reach the container', async () => {
        const host = makeHost();
        const controller = getTaskRingGridController(host);

        const first = controller.create(fullData);
        const second = controller.create(fullData);
        expect(frames).toHaveLength(2);

        frames[0]();
        expect(await first).toEqual([]);
        expect(host.containerReads).toBe(0);

        frames[1]();
        await second;
        expect(host.containerReads).toBeGreaterThanOrEqual(1);
    });

    it('cancels a pending build when cleanup() runs before its frame', async () => {
        const host = makeHost();
        const controller = getTaskRingGridController(host);

        const pending = controller.create(fullData);
        controller.cleanup();
        const readsAfterCleanup = host.containerReads;

        frames[0]();
        expect(await pending).toEqual([]);
        expect(host.containerReads).toBe(readsAfterCleanup);
    });

    it('lets an empty-data create() supersede a pending full build', async () => {
        // WHY: the empty path returns synchronously with a placeholder chart; if
        // the earlier frame still landed, the full grid would paint over it.
        const host = makeHost();
        const controller = getTaskRingGridController(host);

        const pending = controller.create(fullData);
        await controller.create(emptyData);
        const readsAfterEmpty = host.containerReads;

        frames[0]();
        expect(await pending).toEqual([]);
        expect(host.containerReads).toBe(readsAfterEmpty);
    });
});
