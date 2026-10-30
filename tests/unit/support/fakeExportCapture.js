/**
 * A stand-in for `exportCapture.js`, for suites that fake the capture:
 * `vi.mock(capturePath, () => import('…/fakeExportCapture.js'))`, then import
 * `captureExportRoot` from here to steer and inspect it. It captures nothing until a
 * test says what it resolves to.
 */

import { vi } from 'vitest';

/** @typedef {typeof import('../../../src/common/export/exportCapture.js')} ExportCaptureModule */

/** @type {import('vitest').Mock<ExportCaptureModule['captureExportRoot']>} */
export const captureExportRoot = vi.fn();
