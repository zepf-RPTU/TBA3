import css from '@eslint/css';
import { defineConfig } from 'eslint/config';

// ESLint lints CSS only. JavaScript is oxlint's (.oxlintrc.json at the repo root): its
// correctness rules plus eslint-plugin-jsdoc, which it runs as a JS plugin under the
// `jsdoc-eslint` alias with the rules of the plugin's typescript-flavor error preset.
export default defineConfig([
    {
        files: ['**/*.css'],
        plugins: { css },
        language: 'css/css',
        extends: ['css/recommended'],
        rules: {
            // Prevent specificity escapes — any !important should be a deliberate exception
            // discussed and approved, not a quick fix.
            'css/no-important': 'warn',

            // Require Baseline "newly available" rather than the rule's default of
            // "widely available" (which lags newly-available by 30 months).
            //
            // This is a self-hosted dashboard served to current evergreen browsers; it has
            // no legacy-browser target that would justify the stricter default. Checked
            // against web-features 3.34 (the installed @eslint/css 0.8.1 ships an older
            // snapshot — latest is 1.4.0):
            //   container-queries — Baseline HIGH since 2025-08-14. Already widely
            //     available; the bundled data is simply stale. Used for the responsive
            //     containment tier in view-layout.css, which src/sl/slAppModule.css undoes
            //     with `container-type: normal`.
            //   scrollbar-gutter  — Baseline LOW since 2024-12-11, so genuinely not
            //     widely available until ~2027. Keeps the MA task-ring grid centred
            //     (see the comment at its declaration); no substitute.
            //
            // "newly" still fails anything not in Baseline at all, so experimental CSS
            // is still caught — `user-select` is exempted at its one call site instead.
            'css/use-baseline': ['warn', { available: 'newly' }],
        },
        // NOTE: @eslint/css does not yet support property-value allowlist rules.
        // The --fs-sm / --fs-base / --fs-lg font-size token constraint
        // (documented in src/styles/foundation/variables.css) is enforced by
        // code review only.
    },
]);
