import { arraysEqual } from './arrays.js';
import { ChartHostModule } from '../../../../common/charts/host/chartHostModule.js';

/**
 * Resolve the outer chart host container for destroy/recreate flows.
 * Titled ContentModules move the host id to `.content-module-body`, so a raw
 * `getElementById()` can return the inner body instead of the outer host.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule|null|undefined} module - The chart host, when one is mounted.
 * @param {string} containerId - Id of the outer host element.
 * @returns {HTMLElement|null} The outer host, or `null` when it is not in the DOM.
 */
function resolveChartHostContainer(module, containerId) {
    if (module?.container instanceof HTMLElement) {
        return module.container;
    }

    const container = document.getElementById(containerId);
    if (!(container instanceof HTMLElement)) {
        return null;
    }

    if (
        container.classList.contains('content-module-body') &&
        container.parentElement instanceof HTMLElement
    ) {
        return container.parentElement;
    }

    return container;
}

/**
 * Determine whether an existing task-ring host can be reused cheaply.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule|null|undefined} module - The existing host, if there is one.
 * @param {{[key: string]: any}} nextData - The data the host would render next.
 * @returns {'rebuild'|'noop'|'selected-students'|'update'} How much work the new data actually needs: nothing, the cheap selection-only path, a full update, or a rebuild.
 */
function getTaskRingHostReuseMode(module, nextData) {
    const renderContainer =
        module?.contentContainer instanceof HTMLElement
            ? module.contentContainer
            : module?.container;

    if (
        !module?.initialized ||
        module.destroyed ||
        !(renderContainer instanceof HTMLElement) ||
        !renderContainer.isConnected
    ) {
        return 'rebuild';
    }

    const currentData = module.getData?.();
    if (!currentData) {
        return 'update';
    }

    const sameCoreData =
        currentData.itemArray === nextData.itemArray &&
        currentData.studentArray === nextData.studentArray &&
        currentData.domains === nextData.domains;

    const currentSelectedStudents = Array.isArray(currentData.selectedStudents)
        ? currentData.selectedStudents
        : [];
    const nextSelectedStudents = Array.isArray(nextData.selectedStudents)
        ? nextData.selectedStudents
        : [];

    if (sameCoreData && arraysEqual(currentSelectedStudents, nextSelectedStudents)) {
        return 'noop';
    }

    if (
        sameCoreData &&
        typeof (/** @type {any} */ (module).updateSelectedStudentsOptimized) === 'function'
    ) {
        return 'selected-students';
    }

    return 'update';
}

/**
 * Reuse an existing task-ring host when possible.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule|null|undefined} module - The existing host, if there is one.
 * @param {object} nextData - The data to render.
 * @returns {Promise<'rebuild'|'noop'|'selected-students'|'update'>} What was actually done; `rebuild` means the caller still has to.
 */
export async function updateTaskRingHostIfReusable(module, nextData) {
    if (!module) return 'rebuild';
    const reuseMode = getTaskRingHostReuseMode(module, nextData);

    if (reuseMode === 'rebuild') {
        return reuseMode;
    }

    // The seeded Leitidee is not part of the data comparison — the live selection
    // drifts with ring clicks — so every cheap path applies it explicitly.
    const applySeededDomain = () => {
        if (nextData.selectedDomain) {
            /** @type {any} */ (module).selectDomain?.(nextData.selectedDomain);
        }
    };

    if (reuseMode === 'noop') {
        applySeededDomain();
        return reuseMode;
    }

    if (reuseMode === 'selected-students') {
        const updated = /** @type {any} */ (module).updateSelectedStudentsOptimized?.(
            Array.isArray(nextData.selectedStudents) ? nextData.selectedStudents : [],
        );

        if (updated) {
            applySeededDomain();
            return reuseMode;
        }
    }

    await module.update(nextData);
    return 'update';
}

/**
 * Swap a chart host in place, reusing it when the new data allows and rebuilding it
 * when it does not.
 *
 * A rebuild keeps the host container and gives it to the new host: `destroy()` empties
 * the container it adopted at mount rather than removing it (baseModule.js — removing
 * it would orphan a node the parent still tracks), so the node survives and only its
 * contents need clearing. A titled `ContentModule` moves the host id onto
 * `.content-module-body`, so the node to reuse is the outer host, not whatever
 * `getElementById` returns — hence `resolveChartHostContainer`.
 *
 * The old host is discarded after `cleanupDelay` so its teardown cannot race the new
 * render; a request that arrives during that window abandons this one rather than
 * mounting a host the caller no longer wants.
 * @param {object} options - The host to reuse or rebuild, and everything a rebuild needs.
 * @param {import('@tba3/module-base/modules/baseModule.js').BaseModule} options.owner - The view the host is registered as a child of.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule|null} options.module - The existing host, if there is one.
 * @param {object} options.data - The data to render.
 * @param {string} options.containerId - Id of the host container, preserved across a rebuild.
 * @param {object} options.config - The chart config descriptor a rebuilt host is driven by.
 * @param {object} options.moduleOptions - Options passed to a rebuilt host.
 * @param {Function} options.reuseProbe - `(module, data) => Promise<status>`. Decides how much work the new data needs, and performs the cheap paths itself; anything but `rebuild` ends the swap. The swap has no policy of its own: a probe written for one chart's data would answer `noop` for another's.
 * @param {number} [options.cleanupDelay] - How long to wait before discarding the old host, so its teardown does not race the new render.
 * @param {Function} [options.hasPendingRequest] - Consulted after the delay; a newer request abandons this swap.
 * @returns {Promise<{module: import('../../../../common/charts/host/chartHostModule.js').ChartHostModule|null, status: string}>} The live host and what happened to it: whatever the probe returned, or `rebuild`, `aborted`, or `missing-container`.
 */
export async function remountChartHost({
    owner,
    module,
    data,
    containerId,
    config,
    moduleOptions,
    reuseProbe,
    cleanupDelay = 50,
    hasPendingRequest = () => false,
}) {
    const reuseMode = await reuseProbe(module, data);
    if (reuseMode !== 'rebuild') {
        return { module, status: reuseMode };
    }

    const container = resolveChartHostContainer(module, containerId);
    const containerParent = container?.parentNode;

    /** @type {any} */ (owner).destroyAndUnregister(module);

    await new Promise((resolve) => {
        let settled = false;
        // Untracked once it has settled: the cancel handle is one-shot, and a host
        // rebuilt on every data change would otherwise pile them up on the owner.
        let cancelHandle = null;
        const finish = () => {
            if (settled) return;
            settled = true;
            if (cancelHandle) owner.resources.untrackDisposable(cancelHandle);
            resolve(undefined);
        };

        if (owner.destroyed || owner.resources.destroyed) {
            finish();
            return;
        }

        const timeoutId = owner.resources.trackTimeout(finish, cleanupDelay);
        cancelHandle = owner.resources.trackDisposable({
            destroy() {
                clearTimeout(timeoutId);
                finish();
            },
        });

        if (owner.destroyed) finish();
    });

    if (owner.destroyed || hasPendingRequest()) {
        return { module: null, status: 'aborted' };
    }

    // Captured before the delay, so re-check that the node is still in the document.
    if (
        !(container instanceof HTMLElement) ||
        !(containerParent instanceof HTMLElement) ||
        !container.isConnected
    ) {
        return { module: null, status: 'missing-container' };
    }

    // Empty rather than replace: the old host left the node in place, but a container
    // that was never mounted may still hold placeholder markup.
    container.innerHTML = '';

    const nextModule = new ChartHostModule(containerId, container, config, moduleOptions);
    await nextModule.init({ ...data });
    /** @type {any} */ (owner).registerChildModule(nextModule);

    return { module: nextModule, status: 'rebuild' };
}
