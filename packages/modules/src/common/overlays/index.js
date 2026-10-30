/**
 * The body overlays: the modal `<dialog>` shell the covering overlays compose, the
 * confirmation before a destructive action, the Escape rule of the non-modal popovers,
 * and the item preview.
 */

export { ModalDialog, topModalDialog } from './modalDialog.js';
export { confirmDialog } from './confirmDialog.js';
export { isUnclaimedEscape } from './unclaimedEscape.js';
export { showItemPreview } from './itemPreviewOverlay.js';
