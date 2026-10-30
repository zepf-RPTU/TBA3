// @vitest-browser

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals-core';
import { page } from 'vitest/browser';

import { BatchExportToolbar } from '../../../../src/common/export/batchExportToolbar.js';

/** The view on screen, as the app's shell state holds it. */
const currentView = signal(/** @type {string|null} */ ('overview'));

/**
 * A toolbar at the end of `host` over a cart holding one capture, its texts the glossary
 * paths.
 * @param {HTMLElement} host
 * @param {() => void} [onOpenReport]
 * @returns {{toolbar: BatchExportToolbar, element: HTMLElement}}
 */
function makeToolbar(host, onOpenReport = () => {}) {
    // Cast once: the toolbar reads only the cart's selection and the required texts.
    const context = /** @type {ConstructorParameters<typeof BatchExportToolbar>[0]['context']} */ (
        /** @type {unknown} */ ({
            exportCart: { selection: signal(['capture-1']) },
            glossary: { getRequiredEntryText: (/** @type {string} */ path) => path },
        })
    );
    const toolbar = new BatchExportToolbar({ host, context, currentView, onOpenReport });
    return {
        toolbar,
        element: /** @type {HTMLElement} */ (host.querySelector('.batch-export-toolbar')),
    };
}

describe('BatchExportToolbar', () => {
    /** @type {BatchExportToolbar|null} */
    let toolbar = null;
    /** @type {HTMLElement} */
    let shell;
    beforeEach(() => {
        currentView.value = 'overview';
        shell = document.createElement('div');
        document.body.append(shell);
    });
    afterEach(() => {
        toolbar?.dispose();
        toolbar = null;
        shell.remove();
    });

    it('asks the app to open the report', () => {
        const onOpenReport = vi.fn();
        const made = makeToolbar(shell, onOpenReport);
        toolbar = made.toolbar;

        // The glossary stub answers with the path, so that is the button's name.
        /** @type {HTMLElement} */ (
            page
                .elementLocator(made.element)
                .getByRole('button', { name: 'general.buttons.element_texts.report-open.label' })
                .element()
        ).click();

        expect(onOpenReport).toHaveBeenCalledTimes(1);
    });

    it('ends the shell it is built in and shows while the cart holds anything, off the report', () => {
        // Fixed over the page it covered the cards' legends; as the shell's last item
        // the views give it its room.
        shell.append(document.createElement('section'));
        const made = makeToolbar(shell);
        toolbar = made.toolbar;

        expect(shell.lastElementChild).toBe(made.element);
        expect(made.element.hidden).toBe(false);
        currentView.value = 'report';
        expect(made.element.hidden).toBe(true);
        currentView.value = 'overview';
        expect(made.element.hidden).toBe(false);
    });

    it('stays the last item when the app appends after it was built', () => {
        // SL appends its nav cards once the toolbar is built.
        const made = makeToolbar(shell);
        toolbar = made.toolbar;
        currentView.value = 'report';
        shell.append(document.createElement('nav'));

        currentView.value = 'overview';

        expect(shell.lastElementChild).toBe(made.element);
    });

    it('leaves the page when disposed', () => {
        const made = makeToolbar(shell);
        made.toolbar.dispose();

        expect(shell.contains(made.element)).toBe(false);
    });
});
