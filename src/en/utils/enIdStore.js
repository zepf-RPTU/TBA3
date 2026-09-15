/**
 * createIdStore — factory for id-indexed record stores.
 *
 * Backs the "selection sync" pattern:
 * a producer indexes the full, immutable dataset once; its sync callback then
 * carries only id arrays, and consumers resolve full records via getByIds().
 *
 * One contract backs the EN item and student stores, and any chart or table
 * needing the same indexing.
 * @param {string} keyField - Record property used as the map key (e.g. 'iqbId', 'studentId')
 * @returns {{setAll(records: Array<object>): void, getByIds(ids: Array): Array<object>}} A store that indexes records once and resolves id arrays back to them.
 */
export function createIdStore(keyField) {
    let byId = new Map();

    return {
        /**
         * Index the given records by `keyField`. Replaces any previous contents.
         * @param {Array<object>} records - Records, each carrying `keyField`
         */
        setAll(records) {
            byId = new Map(records.map((r) => [r[keyField], r]));
        },

        /**
         * Resolve an ordered id array to the corresponding records.
         * Preserves array order — position encodes sort rank.
         * Ids with no matching record are silently dropped.
         * @param {Array} ids - Ids in the order the caller wants the records back.
         * @returns {Array<object>} The matching records, in that order; unmatched ids are dropped.
         */
        getByIds(ids) {
            const out = [];
            for (const id of ids) {
                const r = byId.get(id);
                if (r !== undefined) out.push(r);
            }
            return out;
        },
    };
}
