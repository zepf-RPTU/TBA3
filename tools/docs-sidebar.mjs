/**
 * Docs tree for the VitePress wiki and the generated module index.
 *
 *   node tools/docs-sidebar.mjs [--check]
 *
 * The unit docs beside the sources already form a tree through their Markdown links:
 * an app doc's `## Views` table links every view doc, a view doc's `## Kinder` table
 * links its children (and a child with its own `## Kinder` table links further down).
 * `buildDocTree()` walks those links — no app code is imported — and yields one group per
 * app in `viewConfig` order, a group for the unit docs nobody reaches (the shared
 * bases under src/common and per-app leftovers), the hand-written docs/ set and, when
 * docs/todo exists, its open items. `docs/.vitepress/config.mjs` turns the tree into the
 * sidebar.
 *
 * Without arguments the script writes `docs/module-index.md`: every unit with its kind,
 * source, doc and the docs that use it. `--check` regenerates in memory and fails when
 * the committed file differs, so `npm run check` proves the index is current.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    listFiles,
    listUnitSources,
    readTextFile,
    repoRoot,
    toRelativePath,
} from './lib/moduleUnits.mjs';
import { h1LinesOf, sectionOf } from './lib/markdown.mjs';
import { generateOrCheck } from './lib/generatedFile.mjs';

const apps = [
    { id: 'en', label: 'EN — Englisch 8', doc: 'src/en/enAppModule.md' },
    { id: 'ma', label: 'MA — Mathe 3', doc: 'src/ma/maAppModule.md' },
    { id: 'sl', label: 'SL — Schulleitung', doc: 'src/sl/slAppModule.md' },
];
const moduleIndexPath = path.join(repoRoot, 'docs', 'module-index.md');
const docsDirectory = path.join(repoRoot, 'docs');

function headingOf(relativePath) {
    const [h1] = h1LinesOf(readTextFile(path.join(repoRoot, relativePath)));
    return (h1 ?? path.basename(relativePath, '.md')).trim().replaceAll('`', '');
}

/** Markdown links to `.md` files inside the given `## heading` section, repo-relative, in order. */
function linkedDocs(relativePath, heading) {
    const section = sectionOf(readTextFile(path.join(repoRoot, relativePath)), heading);
    const directory = path.posix.dirname(relativePath);
    const targets = [];
    for (const match of section.matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
        const target = path.posix.normalize(path.posix.join(directory, match[1]));
        if (!targets.includes(target)) targets.push(target);
    }
    return targets;
}

function toLink(relativePath) {
    return '/' + relativePath.replace(/\.md$/, '');
}

/**
 * @returns {{
 *   groups: { text: string, items: object[] }[],
 *   usedBy: Map<string, string[]>,
 * }} sidebar groups (VitePress `SidebarItem` shape) and, per unit doc, the docs that
 * list it under `## Views` or `## Kinder`.
 */
export function buildDocTree() {
    const usedBy = new Map();
    const reached = new Set();

    function record(child, parent) {
        if (!usedBy.has(child)) usedBy.set(child, []);
        const owners = usedBy.get(child);
        if (!owners.includes(parent)) owners.push(parent);
    }

    function childItems(relativePath, heading, trail) {
        return linkedDocs(relativePath, heading).map((child) => {
            record(child, relativePath);
            reached.add(child);
            const item = { text: headingOf(child), link: toLink(child) };
            if (!trail.includes(child)) {
                const grandchildren = childItems(child, 'Kinder', [...trail, child]);
                if (grandchildren.length > 0) {
                    item.items = grandchildren;
                    item.collapsed = true;
                }
            }
            return item;
        });
    }

    const appGroups = apps.map((app) => {
        reached.add(app.doc);
        return {
            text: app.label,
            collapsed: true,
            items: [
                { text: headingOf(app.doc), link: toLink(app.doc) },
                ...childItems(app.doc, 'Views', [app.doc]),
            ],
        };
    });

    const unitDocs = listUnitSources()
        .map(({ docPath }) => toRelativePath(docPath))
        .filter((relativePath) => fs.existsSync(path.join(repoRoot, relativePath)))
        .sort();
    const unreached = unitDocs.filter((relativePath) => !reached.has(relativePath));
    apps.forEach((app, index) => {
        const group = appGroups[index];
        const leftovers = unreached.filter((relativePath) =>
            relativePath.startsWith(`src/${app.id}/`),
        );
        if (leftovers.length > 0) {
            group.items.push({
                text: 'Weitere',
                collapsed: true,
                items: leftovers.map((relativePath) => ({
                    text: headingOf(relativePath),
                    link: toLink(relativePath),
                })),
            });
        }
    });
    const shared = unreached
        .filter((relativePath) => relativePath.startsWith('src/common/'))
        .map((relativePath) => ({ text: headingOf(relativePath), link: toLink(relativePath) }));

    const docsPages = listFiles(docsDirectory)
        .filter(
            (filePath) =>
                filePath.endsWith('.md') && !filePath.includes(`${path.sep}.vitepress${path.sep}`),
        )
        .map(toRelativePath)
        .sort();
    const pageItem = (relativePath) => ({
        text: headingOf(relativePath),
        link: toLink(relativePath),
    });
    const handWritten = docsPages.filter((relativePath) => !relativePath.startsWith('docs/todo/'));
    const open = docsPages.filter((relativePath) => relativePath.startsWith('docs/todo/'));

    const groups = [
        {
            text: 'Dokumentation',
            items: [{ text: 'README', link: '/' }, ...handWritten.map(pageItem)],
        },
        ...appGroups,
        { text: 'Gemeinsam (src/common)', collapsed: true, items: shared },
    ];
    if (open.length > 0) {
        groups.push({ text: 'Offen (docs/todo)', collapsed: true, items: open.map(pageItem) });
    }
    return { groups, usedBy };
}

function renderModuleIndex({ usedBy }) {
    const fromDocs = (relativePath) => path.posix.relative('docs', relativePath);
    const rows = listUnitSources()
        .map(({ sourcePath, docPath, units }) => ({
            source: toRelativePath(sourcePath),
            doc: toRelativePath(docPath),
            units,
        }))
        .sort((a, b) => a.source.localeCompare(b.source))
        .map(({ source, doc, units }) => {
            const owners = (usedBy.get(doc) ?? [])
                .map((owner) => `[${path.posix.basename(owner, '.md')}](${fromDocs(owner)})`)
                .join(', ');
            const names = units.map((unit) => `\`${unit.name}\``).join(', ');
            const kinds = [...new Set(units.map((unit) => unit.kind))].join(', ');
            return `| ${names} | ${kinds} | [${path.posix.basename(source)}](${fromDocs(source)}) | [${path.posix.basename(doc)}](${fromDocs(doc)}) | ${owners} |`;
        });
    return [
        '# Modulindex',
        '',
        'Generiert von `node tools/docs-sidebar.mjs` aus dem Unit-Scan (`tools/lib/moduleUnits.mjs`)',
        'und den `## Views`-/`## Kinder`-Tabellen der Unit-Docs; `npm run check` prüft, dass die',
        'Datei aktuell ist. Nicht von Hand bearbeiten.',
        '',
        '| Unit | Art | Quelle | Doc | Verwendet von |',
        '|---|---|---|---|---|',
        ...rows,
        '',
    ].join('\n');
}

// `fileURLToPath`, not a hand-rolled strip of the URL's pathname: the pathname is
// percent-encoded, so a checkout under a path with a space or an umlaut would never
// match and the script would silently do nothing — including under `--check`.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    generateOrCheck({
        files: [{ outPath: moduleIndexPath, content: renderModuleIndex(buildDocTree()) }],
        staleMessage: 'docs/module-index.md is stale; run `node tools/docs-sidebar.mjs`.',
        okMessage: 'docs/module-index.md is current.',
        wroteMessage: `wrote ${toRelativePath(moduleIndexPath)}`,
    });
}
