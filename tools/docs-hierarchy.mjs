/**
 * The `## Klassenhierarchie` section of every unit doc.
 *
 *   node tools/docs-hierarchy.mjs [--check]
 *
 * The section is a nested link list: the unit's ancestors from `BaseModule` down, the unit
 * itself in bold, then its direct subclasses — for `ChartHostModule`, the chart
 * descriptors it hosts. Everything comes from the unit scan (`tools/lib/moduleUnits.mjs`),
 * so a rename or a new base class cannot leave a stale tree behind. The script rewrites
 * only the section's body; tools/check-structure.mjs requires the heading. `--check` fails
 * when a committed section differs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { listUnitSources, readTextFile, toRelativePath } from './lib/moduleUnits.mjs';
import { replaceSection } from './lib/markdown.mjs';
import { generateOrCheck } from './lib/generatedFile.mjs';

const heading = 'Klassenhierarchie';

/** @returns {Map<string, import('./lib/moduleUnits.mjs').ModuleUnit & { doc: string }>} */
function collectUnits(sources) {
    const units = new Map();
    for (const { docPath, units: fileUnits } of sources) {
        for (const unit of fileUnits) {
            if (units.has(unit.name)) {
                throw new Error(`${unit.name} is declared twice; the hierarchy keys units by name`);
            }
            units.set(unit.name, { ...unit, doc: toRelativePath(docPath) });
        }
    }
    return units;
}

function renderTree(units, unit, fromDoc) {
    const link = (node) =>
        `[${node.name}](${path.posix.relative(path.posix.dirname(fromDoc), node.doc)})`;
    const relation = (node) => {
        if (node.descriptor) return ' — Descriptor';
        return node.mixin ? ` — über Mixin \`${node.mixin}\`` : '';
    };
    const item = (depth, label, node) => `${'  '.repeat(depth)}- ${label}${relation(node)}`;

    const ancestors = [];
    for (let node = units.get(unit.base); node; node = units.get(node.base)) {
        ancestors.unshift(node);
    }
    const children = [...units.values()]
        .filter((node) => node.base === unit.name)
        .sort((a, b) => a.name.localeCompare(b.name));
    const depth = ancestors.length;
    return [
        ...ancestors.map((node, index) => item(index, link(node), node)),
        item(depth, `**${unit.name}**`, unit),
        ...children.map((node) => item(depth + 1, link(node), node)),
    ].join('\n');
}

const sources = listUnitSources();
const units = collectUnits(sources);
const files = sources
    .filter(({ docPath }) => fs.existsSync(docPath))
    .map(({ docPath, units: fileUnits }) => {
        const doc = toRelativePath(docPath);
        const trees = fileUnits.map((unit) => renderTree(units, units.get(unit.name), doc));
        const text = readTextFile(docPath).replace(/\r\n/g, '\n');
        return {
            outPath: docPath,
            content: replaceSection(text, heading, `${trees.join('\n\n')}\n\n`),
        };
    });

generateOrCheck({
    files,
    staleMessage: `A unit doc's ## ${heading} is stale; run \`node tools/docs-hierarchy.mjs\`.`,
    okMessage: `Every unit doc's ## ${heading} is current.`,
    wroteMessage: `wrote ## ${heading} in ${files.length} unit docs`,
});
