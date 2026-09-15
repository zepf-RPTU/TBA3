/**
 * Print the assembled glossary tree as canonical JSON (keys sorted at every
 * level), so two dumps can be compared with a plain diff.
 *
 * Its job is to prove that moving an entry out of `packages/modules/src/common/glossary/glossary.json` into a
 * co-located `<owner>.glossary.json` changed nothing: capture a dump before the
 * move, re-run it after, and the diff must be empty. Key order is normalised
 * because a moved entry re-enters its parent object at the end rather than in
 * its original position, which is not a difference in meaning.
 *
 *   node tools/dump-glossary.mjs > before.json
 *   node tools/dump-glossary.mjs > after.json
 *   git diff --no-index before.json after.json
 */

import { enGlossary } from '../src/en/enGlossary.js';
import { maGlossary } from '../src/ma/maGlossary.js';
import { slGlossary } from '../src/sl/slGlossary.js';

function sortKeys(value) {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value === null || typeof value !== 'object') return value;

    return Object.fromEntries(
        Object.keys(value)
            .sort()
            .map((key) => [key, sortKeys(value[key])]),
    );
}

// Each barrel assembles the whole tree but merges only its own app's fragments,
// so every namespace has to come from the barrel that owns it. `general.*` is
// never fragmented — any barrel carries the same copy.
console.log(
    JSON.stringify(
        sortKeys({
            en: enGlossary.en,
            ma: maGlossary.ma,
            sl: slGlossary.sl,
            general: enGlossary.general,
        }),
        null,
        4,
    ),
);
