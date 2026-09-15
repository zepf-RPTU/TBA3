/**
 * comparisonState — the small port a chart uses to know which comparison averages
 * are shown, and to toggle them.
 *
 * The chart layer never needed an app state object: measured, its whole dependency
 * is two verbs plus one push channel. Average *values* always arrive as payload or
 * options; what came from the app was only the visibility toggle. Naming that as a
 * port lets a host with no app state of its own drive the same charts —
 * `createComparisonState()` is a complete implementation for one that wants toggles,
 * and a host that wants none passes nothing at all.
 *
 * Passing nothing is not the same as passing an empty list: with no state a chart
 * draws every comparison the payload carries, because a caller that delivered
 * averages and no opinion about visibility means to see them. An empty list is an
 * opinion, and hides everything.
 */

/**
 * @typedef {object} ComparisonState
 * @property {() => string[]} getActiveModes - The ids currently shown.
 * @property {(id: string) => boolean} isActive - Whether one id is shown.
 * @property {(id: string, active: boolean) => void} setActive - Show or hide one id.
 * @property {(callback: (ids: string[]) => void) => () => void} subscribe - Observe changes; returns an unsubscribe.
 */

/**
 * A self-contained comparison state, for a host with no app state of its own.
 *
 * The id space is shared across every chart a host shows: two charts offering the
 * same id are toggled together, which is what makes one ⌀ menu mean the same thing
 * everywhere.
 * @param {string[]} [initialActiveIds] - Ids shown from the start; none by default.
 * @returns {ComparisonState} A state object charts and the ⌀ control can drive.
 */
export function createComparisonState(initialActiveIds = []) {
    const active = new Set(initialActiveIds);
    const subscribers = new Set();

    const publish = () => {
        const ids = [...active];
        for (const callback of subscribers) callback(ids);
    };

    return {
        getActiveModes: () => [...active],
        isActive: (id) => active.has(id),
        setActive: (id, isOn) => {
            if (active.has(id) === Boolean(isOn)) return;
            if (isOn) active.add(id);
            else active.delete(id);
            publish();
        },
        subscribe: (callback) => {
            subscribers.add(callback);
            return () => subscribers.delete(callback);
        },
    };
}

/**
 * The comparison ids a chart shows before anything is pushed into it.
 *
 * `null` is the answer for a host that supplied no state, and every consumer of it
 * reads that as "draw them all" — distinct from `[]`, which hides everything.
 * @param {{comparisonState?: ComparisonState|null}} [options] - The chart's options.
 * @returns {string[]|null} The ids shown at construction, or null for no opinion.
 */
export function initialActiveModes(options) {
    return options?.comparisonState ? options.comparisonState.getActiveModes() : null;
}

/**
 * Push a state object's changes into a chart host, the way a view does.
 *
 * Charts pull their initial visibility in their constructor and are pushed to
 * afterwards, so binding covers only the second half — construct the host with the
 * same state object and both halves are in place.
 * @param {{setActiveModes: (ids: string[]) => void}} host - A chart host exposing the `setActiveModes` verb.
 * @param {ComparisonState} state - The state to follow.
 * @returns {() => void} Stops following.
 */
export function bindComparisonState(host, state) {
    return state.subscribe((ids) => host.setActiveModes(ids));
}
