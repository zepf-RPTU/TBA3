// @vitest-browser

import { describe, it, expect, vi } from 'vitest';
import { SingletonOverlay } from '../../../../../src/common/modules/overlays/singletonOverlay.js';

function dispatchEscape() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
}

describe('SingletonOverlay', () => {
    it('builds the root lazily on first show() and appends it to document.body', () => {
        const buildContent = vi.fn();
        const overlay = new SingletonOverlay('test-overlay', buildContent);

        expect(overlay.getRoot()).toBeNull();
        expect(buildContent).not.toHaveBeenCalled();

        overlay.show();

        expect(buildContent).toHaveBeenCalledTimes(1);
        const root = overlay.getRoot();
        expect(root?.parentElement).toBe(document.body);
        expect(root?.classList.contains('test-overlay')).toBe(true);

        overlay.hide();
    });

    it('does not rebuild the root on subsequent show() calls', () => {
        const buildContent = vi.fn();
        const overlay = new SingletonOverlay('test-overlay', buildContent);

        overlay.show();
        const firstRoot = overlay.getRoot();
        overlay.hide();
        overlay.show();

        expect(buildContent).toHaveBeenCalledTimes(1);
        expect(overlay.getRoot()).toBe(firstRoot);

        overlay.hide();
    });

    it('toggles the visible class with show/hide/toggle', () => {
        const overlay = new SingletonOverlay('test-overlay', () => {});
        const isVisible = () => overlay.getRoot()?.classList.contains('visible');

        overlay.show();
        expect(isVisible()).toBe(true);

        overlay.hide();
        expect(isVisible()).toBe(false);

        overlay.toggle();
        expect(isVisible()).toBe(true);
        overlay.toggle();
        expect(isVisible()).toBe(false);
    });

    it('fires onShow/onHide on every transition, including via Escape', () => {
        const onShow = vi.fn();
        const onHide = vi.fn();
        const overlay = new SingletonOverlay('test-overlay', () => {}, { onShow, onHide });

        overlay.show();
        expect(onShow).toHaveBeenCalledTimes(1);
        expect(onHide).not.toHaveBeenCalled();

        dispatchEscape();
        expect(onHide).toHaveBeenCalledTimes(1);
        expect(overlay.getRoot()?.classList.contains('visible')).toBe(false);
    });

    it('blockEscapeClose suppresses the Escape-close path', () => {
        const onHide = vi.fn();
        const overlay = new SingletonOverlay('test-overlay', () => {}, {
            blockEscapeClose: () => true,
            onHide,
        });

        overlay.show();
        dispatchEscape();

        expect(overlay.getRoot()?.classList.contains('visible')).toBe(true);
        expect(onHide).not.toHaveBeenCalled();

        overlay.hide();
    });

    it('ignores Escape when not currently visible', () => {
        const onHide = vi.fn();
        const overlay = new SingletonOverlay('test-overlay', () => {}, { onHide });

        overlay.show();
        overlay.hide();
        onHide.mockClear();

        dispatchEscape();

        expect(onHide).not.toHaveBeenCalled();
    });
});
