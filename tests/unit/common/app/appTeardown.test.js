// @vitest-browser

/**
 * The page-level services an app starts (the header-menu coordinator, the tooltip
 * service, the uncaught-failure toasts, the colour-scheme follower) listen on the page:
 * an app torn down without removing them leaves its listeners behind, and a second app
 * stacks another set.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installGlobalErrorNotifications } from '../../../../src/common/services/notificationService.js';
import { initColorScheme } from '@tba3/modules/theme';
import { BaseAppModule } from '../../../../src/common/app/appModule.js';
import { placeTestApp, testAppOptions } from '../../support/testApp.js';
import { EmptyView } from '../../support/emptyView.js';

const VIEW_CONFIG = {
    welcome: {
        icon: 'home',
        skeleton: /** @type {const} */ ('stack'),
        needsData: false,
        load: () => Promise.resolve(EmptyView),
    },
};

class TeardownApp extends BaseAppModule {}
customElements.define('test-teardown-app', TeardownApp);

/**
 * @typedef {object} Registration
 * @property {string} target - Which page target it was added on.
 * @property {string} type
 * @property {EventListenerOrEventListenerObject} listener
 * @property {boolean|AddEventListenerOptions|undefined} options
 * @property {boolean} removed - Whether removeEventListener took it off again.
 */

/**
 * @param {boolean|AddEventListenerOptions|EventListenerOptions|undefined} options
 * @returns {boolean} The capture flag, which identifies a listener alongside type and function.
 */
const captureOf = (options) => (typeof options === 'boolean' ? options : !!options?.capture);

/**
 * Record every listener added on window, document and body, and mark the ones removed.
 * @returns {Registration[]} The live record.
 */
function recordPageListeners() {
    /** @type {Registration[]} */
    const registrations = [];
    /** @type {Array<[string, EventTarget]>} */
    const targets = [
        ['window', window],
        ['document', document],
        ['body', document.body],
    ];
    for (const [name, target] of targets) {
        const add = target.addEventListener.bind(target);
        const remove = target.removeEventListener.bind(target);
        vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
            if (listener) {
                registrations.push({ target: name, type, listener, options, removed: false });
            }
            add(type, listener, options);
        });
        vi.spyOn(target, 'removeEventListener').mockImplementation((type, listener, options) => {
            const match = registrations.find(
                (r) =>
                    r.target === name &&
                    r.type === type &&
                    r.listener === listener &&
                    captureOf(r.options) === captureOf(options),
            );
            if (match) match.removed = true;
            remove(type, listener, options);
        });
    }
    return registrations;
}

/**
 * @param {Registration} registration
 * @returns {boolean} Whether it is off the page again: removed, or its signal aborted.
 */
function isReleased(registration) {
    const { options } = registration;
    const aborted = typeof options === 'object' && options.signal?.aborted === true;
    return registration.removed || aborted;
}

afterEach(() => {
    window.location.hash = '';
});

describe('app teardown', () => {
    it('removes every listener it and its page services added on window, document and body', async () => {
        const registrations = recordPageListeners();

        // As bootstrap does: the colour-scheme follower before the app, the
        // uncaught-failure toasts once the first render resolved, both handed to the app.
        const stopFollowingColorScheme = initColorScheme();
        const app = placeTestApp(
            TeardownApp,
            testAppOptions(VIEW_CONFIG, 'welcome'),
            (teardown) => {
                vi.spyOn(teardown.context.documents, 'ensureAll').mockResolvedValue(undefined);
            },
        );
        app.resources.trackSubscription(stopFollowingColorScheme);
        await app.contentComplete;
        app.resources.trackSubscription(installGlobalErrorNotifications(app.context.glossary));

        const added = registrations.map((r) => `${r.target}:${r.type}`);
        // The page services this pins are among them, so the check below is not vacuous.
        expect(added).toEqual(
            expect.arrayContaining([
                'window:hashchange',
                'window:scroll',
                'window:error',
                'window:unhandledrejection',
                'document:click',
                'document:keydown',
                'body:mouseover',
            ]),
        );

        app.remove();
        // Teardown waits out a move, one microtask.
        await Promise.resolve();

        const leaked = registrations.filter((r) => !isReleased(r));
        expect(leaked.map((r) => `${r.target}:${r.type}`)).toEqual([]);
    });
});
