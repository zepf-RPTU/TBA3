/**
 * The port a chart reads which comparison averages are shown from, and toggles them
 * through: the shown ids as a signal and two verbs. Average values arrive as payload or
 * options; only their visibility comes from the host.
 *
 * A chart handed no state draws every comparison the payload carries; one handed a
 * state with an empty list draws none.
 */

import { signal } from '@preact/signals-core';

/**
 * Both reads are tracked signal reads: a chart reading them inside an effect follows
 * the toggles without subscribing (`ChartRenderer#activeModes`). `activeModes` holds a
 * new array only when the shown ids change, so a reader can compare it by identity.
 * @typedef {object} ComparisonState
 * @property {import('@preact/signals-core').ReadonlySignal<ReadonlyArray<string>>} activeModes - The ids currently shown, in order.
 * @property {(id: string) => boolean} isActive
 * @property {(id: string, active: boolean) => void} setActive
 */

/**
 * What a chart reads of the comparison state: which ids are shown. A chart handed only
 * this (a modal's read-only snapshot) draws the shown groups but offers no ⌀ toggle.
 * @typedef {Pick<ComparisonState, 'activeModes' | 'isActive'>} ComparisonStateReader
 */

/**
 * A self-contained comparison state, for a host with no app state of its own. The id
 * space is shared across every chart a host shows: two charts offering the same id are
 * toggled together. No id is shown at the start.
 * @returns {ComparisonState}
 */
export function createComparisonState() {
    /** @type {import('@preact/signals-core').Signal<ReadonlyArray<string>>} */
    const active = signal(Object.freeze([]));

    return {
        activeModes: active,
        isActive: (id) => active.value.includes(id),
        setActive: (id, isOn) => {
            const ids = active.peek();
            if (ids.includes(id) === Boolean(isOn)) return;
            active.value = Object.freeze(isOn ? [...ids, id] : ids.filter((other) => other !== id));
        },
    };
}
