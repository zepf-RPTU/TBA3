/**
 * School Leadership (SL) Module Constants
 * Domain-specific terminology for the SL module
 */

// ============================================================================
// SCHOOL DATASET CONFIGURATION
// ============================================================================

// `sl` is the hand-built simulation fixture under `data/sl/`, the only dataset the
// dashboard lists. A real school is opened through the `?scope=schools/<id>` escape hatch
// against a running API (src/common/app/classSearchParams.js); the fixture API serves
// this folder under `?scope=schools/sl` the same way.
// The info-box prose is not per dataset: it lives once in `data/sl/info_boxes.json`
// and reads its numbers and its scale wording off whichever dataset is loaded.
export const SL_DATASET_OPTIONS = [{ id: 'sl', label: 'Beispielschule (Demo)', folder: 'sl' }];
