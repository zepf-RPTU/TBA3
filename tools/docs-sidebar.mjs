/**
 * Docs tree for the VitePress wiki and the generated module index.
 *
 *   node tools/docs-sidebar.mjs [--check]
 *
 * The unit docs beside the sources already form a tree through their Markdown links:
 * an app doc's `## Views` table links every view doc, a view doc's `## Kinder` table
 * links its children (and a child with its own `## Kinder` table links further down).
 * `buildDocTree()` walks those links — no app code is imported — and yields one group per
 * app (the app units' docs, in path order, and a `Weitere` item for the unit docs under
 * `src/<app>/` nobody reaches), a group for every other unreached unit doc (the shared
 * bases under src/common and the packages), the hand-written set (docs/ and each
 * workspace package's docs/) and, when docs/todo exists, its open items.
 *
 * Without arguments the script writes `docs/module-index.md`: every unit with its kind,
 * source, doc and the docs that use it. `--check` regenerates in memory and fails when
 * the committed file differs, so `npm run check` proves the index is current.
 */
import path from 'node:path';
import { diskRepo, repoRoot, workspacePackages } from './lib/repo.mjs';
import { linkedDocs, listApps, parseMarkdown, readUnitDocs } from './lib/unitDocs.mjs';
import { generateOrCheck } from './lib/generatedFile.mjs';

/** @typedef {import('vitepress').DefaultTheme.SidebarItem} SidebarItem */
/** @typedef {import('./lib/repo.mjs').Repo} Repo */
/** @typedef {import('./lib/unitDocs.mjs').Markdown} Markdown */
/** @typedef {import('./lib/unitDocs.mjs').UnitDoc} UnitDoc */

/**
 * Each app's sidebar group, by its `src/<app>/` folder.
 * @type {{[appId: string]: string}}
 */
const appLabels = {
    en: 'EN — Englisch 8',
    ma: 'MA — Mathe 3',
    sl: 'SL — Schulleitung',
};

/**
 * @param {string} relativePath
 * @returns {string} Its VitePress link.
 */
function toLink(relativePath) {
    return '/' + relativePath.replace(/\.md$/, '');
}

/**
 * @param {Repo} [repo] - The working tree unless given.
 * @param {UnitDoc[]} [docs] - Its unit docs, when already read.
 * @returns {{
 *   groups: SidebarItem[],
 *   usedBy: Map<string, string[]>,
 * }} sidebar groups (VitePress `SidebarItem` shape) and, per unit doc, the docs that
 * list it under `## Views` or `## Kinder`.
 */
export function buildDocTree(repo = diskRepo(), docs = readUnitDocs(repo)) {
    /** @type {Map<string, Markdown>} A `## Kinder` table may link a doc that is no unit's. */
    const markdownByPath = new Map();
    for (const { path: docPath, markdown } of docs) {
        if (markdown) markdownByPath.set(docPath, markdown);
    }
    /**
     * @param {string} relativePath
     * @returns {Markdown}
     */
    const markdownOf = (relativePath) => {
        let markdown = markdownByPath.get(relativePath);
        if (!markdown) {
            markdown = parseMarkdown(repo.readText(relativePath));
            markdownByPath.set(relativePath, markdown);
        }
        return markdown;
    };
    /**
     * @param {string} relativePath - Repo-relative path of a doc.
     * @returns {string} Its H1, or the file name when it has none.
     */
    const headingOf = (relativePath) =>
        (markdownOf(relativePath).h1s[0] ?? path.posix.basename(relativePath, '.md'))
            .trim()
            .replaceAll('`', '');

    /** @type {Map<string, string[]>} */
    const usedBy = new Map();
    const reached = new Set();

    /**
     * @param {string} child - The linked doc.
     * @param {string} parent - The doc that links it.
     */
    function record(child, parent) {
        const owners = usedBy.get(child) ?? [];
        usedBy.set(child, owners);
        if (!owners.includes(parent)) owners.push(parent);
    }

    /**
     * @param {string} relativePath - The doc whose section is walked.
     * @param {string} heading - `Views` or `Kinder`.
     * @param {string[]} trail - The docs above, so a cycle ends the walk.
     * @returns {SidebarItem[]} Sidebar items, nested.
     */
    function childItems(relativePath, heading, trail) {
        return linkedDocs(markdownOf(relativePath), relativePath, heading).map((child) => {
            record(child, relativePath);
            reached.add(child);
            /** @type {SidebarItem} */
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

    const apps = listApps(docs).map(({ id, doc }) => {
        const label = appLabels[id];
        if (!label)
            throw new Error(`docs-sidebar: name the sidebar group of src/${id}/ in appLabels`);
        return { id, label, doc };
    });
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

    const unreached = docs
        .filter(({ path: docPath, markdown }) => markdown && !reached.has(docPath))
        .map(({ path: docPath }) => docPath);
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
        .filter((relativePath) => !apps.some((app) => relativePath.startsWith(`src/${app.id}/`)))
        .map((relativePath) => ({ text: headingOf(relativePath), link: toLink(relativePath) }));

    const docsPages = ['docs', ...workspacePackages(repo).map(({ dir }) => `${dir}/docs`)]
        .flatMap((directory) => repo.listFiles(directory))
        .filter(
            (relativePath) =>
                relativePath.endsWith('.md') && !relativePath.includes('/.vitepress/'),
        )
        .sort();
    /**
     * @param {string} relativePath
     * @returns {SidebarItem}
     */
    const pageItem = (relativePath) => ({
        text: headingOf(relativePath),
        link: toLink(relativePath),
    });
    const handWritten = docsPages.filter((relativePath) => !relativePath.startsWith('docs/todo/'));
    const open = docsPages.filter((relativePath) => relativePath.startsWith('docs/todo/'));

    /** @type {SidebarItem[]} */
    const groups = [
        {
            text: 'Dokumentation',
            items: [{ text: 'README', link: '/' }, ...handWritten.map(pageItem)],
        },
        ...appGroups,
        { text: 'Gemeinsam', collapsed: true, items: shared },
    ];
    if (open.length > 0) {
        groups.push({ text: 'Offen (docs/todo)', collapsed: true, items: open.map(pageItem) });
    }
    return { groups, usedBy };
}

/**
 * @param {UnitDoc[]} docs
 * @param {ReturnType<typeof buildDocTree>} tree
 * @returns {string} docs/module-index.md.
 */
function renderModuleIndex(docs, { usedBy }) {
    /**
     * @param {string} relativePath - Repo-relative path.
     * @returns {string} The same path relative to docs/.
     */
    const fromDocs = (relativePath) => path.posix.relative('docs', relativePath);
    const docByUnit = new Map(
        docs.flatMap(({ path: docPath, units }) => units.map((unit) => [unit.name, docPath])),
    );
    /**
     * @param {import('./lib/moduleUnits.mjs').ModuleUnit} unit
     * @returns {string} Its base, linked to the base's doc; a descriptor names its host.
     */
    const baseCell = ({ base, descriptor }) => {
        if (!base) return '';
        const baseDoc = docByUnit.get(base);
        const label = baseDoc ? `[${base}](${fromDocs(baseDoc)})` : `\`${base}\``;
        return descriptor ? `${label} (Descriptor)` : label;
    };
    const rows = [...docs]
        // Code-unit order: localeCompare would sort by the machine's locale.
        .sort((a, b) => (a.sourcePath < b.sourcePath ? -1 : 1))
        .map(({ sourcePath, path: doc, units }) => {
            const owners = (usedBy.get(doc) ?? [])
                .map((owner) => `[${path.posix.basename(owner, '.md')}](${fromDocs(owner)})`)
                .join(', ');
            const names = units.map((unit) => `\`${unit.name}\``).join(', ');
            const kinds = [...new Set(units.map((unit) => unit.kind))].join(', ');
            const bases = units.map(baseCell).filter(Boolean).join(', ');
            return `| ${names} | ${kinds} | ${bases} | [${path.posix.basename(sourcePath)}](${fromDocs(sourcePath)}) | [${path.posix.basename(doc)}](${fromDocs(doc)}) | ${owners} |`;
        });
    return [
        '# Modulindex',
        '',
        'Generiert von `node tools/docs-sidebar.mjs` aus dem Unit-Scan (`tools/lib/moduleUnits.mjs`)',
        'und den `## Views`-/`## Kinder`-Tabellen der Unit-Docs; `npm run check` prüft, dass die',
        'Datei aktuell ist. Nicht von Hand bearbeiten. „Basis“ verlinkt die Doc der Klasse, von der',
        'die Unit erbt; ein Chart-Descriptor nennt dort seinen Host.',
        '',
        '| Unit | Art | Basis | Quelle | Doc | Verwendet von |',
        '|---|---|---|---|---|---|',
        ...rows,
        '',
    ].join('\n');
}

// `import.meta.main`, not a comparison of argv[1] with this module's path: Node resolves
// the module through junctions and symlinks but leaves argv[1] as typed, so a linked
// checkout would never match and the script would silently do nothing, `--check` included.
if (import.meta.main) {
    const repo = diskRepo();
    const docs = readUnitDocs(repo);
    const moduleIndexPath = path.join(repoRoot, 'docs', 'module-index.md');
    generateOrCheck({
        files: [
            {
                outPath: moduleIndexPath,
                content: renderModuleIndex(docs, buildDocTree(repo, docs)),
            },
        ],
        staleMessage: 'docs/module-index.md is stale; run `node tools/docs-sidebar.mjs`.',
        okMessage: 'docs/module-index.md is current.',
        wroteMessage: 'wrote docs/module-index.md',
    });
}
