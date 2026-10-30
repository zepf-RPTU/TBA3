/**
 * A Web Lock held until its holder lets go: the primitive that coordinates the tabs of
 * one origin. A held lock dies with its page, so it also tells the other tabs which
 * ones are still open.
 */

/**
 * Request the lock `name` and keep it until released or taken over.
 * @param {string} name
 * @param {LockOptions} options - `ifAvailable` answers at once, `steal` takes it from
 *   its holder, `signal` withdraws a queued request.
 * @param {(release: () => Promise<void>) => void} [onLost] - Called when another request
 *   steals the lock while this one holds it, with the release function the grant gave.
 * @returns {Promise<(() => Promise<void>)|null>} At the grant, the function that lets go
 *   of the lock, settling once the browser has freed it; null when `ifAvailable` found
 *   it held. Rejects when the request fails or is withdrawn before the grant.
 */
export function holdLock(name, options, onLost) {
    return new Promise((resolve, reject) => {
        /** @type {(() => Promise<void>)|null} */
        let release = null;
        const freed = navigator.locks
            .request(name, options, (lock) => {
                if (!lock) {
                    resolve(null);
                    return undefined;
                }
                // The lock is held for as long as this promise is pending.
                return new Promise((letGo) => {
                    const granted = () => {
                        letGo(undefined);
                        return freed;
                    };
                    release = granted;
                    resolve(granted);
                });
            })
            // A rejection after the grant is a steal: the browser took the lock away.
            .then(
                () => {},
                (error) => (release ? onLost?.(release) : reject(error)),
            );
    });
}
