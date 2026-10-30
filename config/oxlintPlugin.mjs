/**
 * tba3's own lint rules, loaded by .oxlintrc.json as the `tba3` JS plugin. The cross-file
 * rules (CSS ownership, module docs, package side effects, glossary resolution) live in
 * tools/check-structure.mjs, the import boundaries in config/dependency-cruiser.mjs.
 */
import path from 'node:path';
import {
    DOC_REFERENCE_PATTERN,
    EMOJI_PATTERN,
    ICON_FONT_PATTERN,
    isUntrackedMarker,
} from '../tools/lib/sourcePatterns.mjs';

/**
 * oxlint exports its rule types only through the RuleTester signature.
 * @typedef {Parameters<import('oxlint/plugins-dev').RuleTester['run']>[1]} Rule
 * @typedef {Exclude<Rule, { createOnce: unknown }>} CreateRule
 * @typedef {ReturnType<CreateRule['create']>} Visitor
 * @typedef {Parameters<NonNullable<Visitor[string]>>[0]} AstNode
 */

/**
 * Some nodes share one interface across several types (a PropertyDefinition is also the
 * TS-abstract one), so a node matches when its `type` union includes T.
 * @template {AstNode['type']} T
 * @typedef {AstNode extends infer N ? N extends { type: infer U } ? T extends U ? N : never : never : never} NodeOf
 */

/**
 * @param {AstNode} node - An expression.
 * @returns {boolean} A non-empty string literal, or a template literal carrying no expression.
 */
function isCopyLiteral(node) {
    if (node.type === 'Literal') return typeof node.value === 'string' && node.value !== '';
    if (node.type === 'TemplateLiteral') {
        return node.expressions.length === 0 && node.quasis[0].value.raw !== '';
    }
    return false;
}

/**
 * @param {AstNode} node - An expression.
 * @returns {string | null} The literal's text, or null when it carries an expression.
 */
function copyLiteralText(node) {
    if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
        return node.quasis[0].value.raw;
    }
    return null;
}

/**
 * @param {AstNode} member - An object member or a class member.
 * @returns {string | null} Its static key name, `#` kept for a private one.
 */
function keyNameOf(member) {
    if (!('key' in member) || !('computed' in member) || member.computed) return null;
    if (member.key.type === 'Identifier') return member.key.name;
    if (member.key.type === 'PrivateIdentifier') return `#${member.key.name}`;
    if (member.key.type === 'Literal') return String(member.key.value);
    return null;
}

/** `glossaryKey`, `glossaryPath`, `glossarySubKey` and their prefixed kin (`infoGlossaryKey`, …). */
const glossaryKeyName = /^(?:glossary(?:Key|Path|SubKey)|\w+Glossary(?:Key|Path))$/;
const copyBesideKeyNames = new Set(['title', 'headerText', 'description', 'subtitle', 'label']);
const copyLiteralNames = new Set(['placeholder', 'noDataMessage', 'ariaLabel']);

/**
 * Every property of an object literal and of the object literals nested in it, functions
 * excluded — the shape a card's options take.
 * @param {NodeOf<'ObjectExpression'>} object
 * @returns {NodeOf<'Property'>[]}
 */
function nestedProperties(object) {
    const found = [];
    const pending = [object];
    while (pending.length > 0) {
        const current = pending.pop();
        if (!current) break;
        for (const property of current.properties) {
            if (property.type !== 'Property') continue;
            found.push(property);
            if (property.value.type === 'ObjectExpression') pending.push(property.value);
            if (property.value.type === 'ArrayExpression') {
                for (const element of property.value.elements) {
                    if (element?.type === 'ObjectExpression') pending.push(element);
                }
            }
        }
    }
    return found;
}

/**
 * The object literals a `ChartHostModule.createChart(id, config, options)` call hands its
 * host as options: the literal itself, or those passed to the call that builds it
 * (`this._childOptions({...})`).
 * @param {NodeOf<'CallExpression'>} node
 * @returns {NodeOf<'ObjectExpression'>[]} The option literals; none for any other call.
 */
function createChartOptionObjects(node) {
    const { callee } = node;
    const isCreateChart =
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'ChartHostModule' &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'createChart';
    const options = node.arguments[2];
    if (!isCreateChart || !options) return [];
    if (options.type === 'ObjectExpression') return [options];
    if (options.type !== 'CallExpression') return [];
    return options.arguments.filter((argument) => argument.type === 'ObjectExpression');
}

/**
 * The glossary is the single source of UI copy. Rejected: a setTitle()/setSubtitle() call
 * with a string literal (data-driven titles pass an expression); a title/headerText/
 * subtitle/description/label literal declared in an object that also names a glossary key
 * (`glossaryKey`, `glossaryPath`, a header choice's `glossarySubKey`, or a prefixed one
 * such as `infoGlossaryKey`) — or anywhere in the options handed to
 * `ChartHostModule.createChart(`, whose key sits in its config file; empty-state
 * sentences, accessible names and confirm prompts as literals. A `subtitle` starting with
 * markup is dynamic content appended after the copy and passes; a template literal
 * carrying `${` is data and passes.
 */
/** @type {CreateRule} */
const glossaryCopyOwnership = {
    meta: {
        messages: {
            setter: 'sets copy from code; put it in the glossary entry',
            besideKey: 'declares copy beside a glossary key; the entry owns it',
            literal: 'carries UI copy as a literal; read it from the glossary',
        },
    },
    create(context) {
        const inGlossaryFolder = /[\\/]glossary[\\/]/.test(context.filename);
        // A property inside two keyed objects (or inside keyed `createChart` options) is
        // reached once per enclosing object; it is reported once.
        /** @type {Set<NodeOf<'Property'>>} */
        const reported = new Set();
        /** @param {NodeOf<'Property'>} property - A property of a card's options. */
        const reportCopyBeside = (property) => {
            if (reported.has(property)) return;
            const name = keyNameOf(property);
            if (!name || !copyBesideKeyNames.has(name) || !isCopyLiteral(property.value)) return;
            if (name === 'subtitle' && copyLiteralText(property.value)?.startsWith('<')) return;
            reported.add(property);
            context.report({ node: property, messageId: 'besideKey' });
        };
        return {
            CallExpression(node) {
                for (const options of createChartOptionObjects(node)) {
                    for (const property of nestedProperties(options)) reportCopyBeside(property);
                }
                const { callee } = node;
                const argument = node.arguments[0];
                if (!argument) return;
                if (
                    callee.type === 'MemberExpression' &&
                    callee.property.type === 'Identifier' &&
                    /^set(?:Title|Subtitle)$/.test(callee.property.name) &&
                    isCopyLiteral(argument)
                ) {
                    context.report({ node, messageId: 'setter' });
                    return;
                }
                if (inGlossaryFolder) return;
                const member = callee.type === 'MemberExpression' ? callee : null;
                const methodName =
                    member?.property.type === 'Identifier' ? member.property.name : null;
                const isConfirm =
                    (callee.type === 'Identifier' && callee.name === 'confirm') ||
                    (methodName === 'confirm' &&
                        member?.object.type === 'Identifier' &&
                        member.object.name === 'window');
                if (isConfirm && isCopyLiteral(argument)) {
                    context.report({ node, messageId: 'literal' });
                    return;
                }
                if (
                    methodName === 'setAttribute' &&
                    argument.type === 'Literal' &&
                    argument.value === 'aria-label' &&
                    node.arguments[1] &&
                    isCopyLiteral(node.arguments[1])
                ) {
                    context.report({ node, messageId: 'literal' });
                }
            },
            Property(node) {
                if (inGlossaryFolder) return;
                const name = keyNameOf(node);
                if (name && copyLiteralNames.has(name) && isCopyLiteral(node.value)) {
                    context.report({ node, messageId: 'literal' });
                }
            },
            ObjectExpression(node) {
                const hasKey = node.properties.some((property) => {
                    const name = keyNameOf(property);
                    return (
                        property.type === 'Property' &&
                        name &&
                        glossaryKeyName.test(name) &&
                        isCopyLiteral(property.value)
                    );
                });
                if (!hasKey) return;
                for (const property of nestedProperties(node)) reportCopyBeside(property);
            },
            Literal(node) {
                if (inGlossaryFolder || typeof node.value !== 'string') return;
                if (/aria-label="(?!")/.test(node.value)) {
                    context.report({ node, messageId: 'literal' });
                }
            },
            TemplateElement(node) {
                if (inGlossaryFolder) return;
                // A quasi ending in `aria-label="` hands the value to an expression: data.
                if (/aria-label="(?!")(?!$)/.test(node.value.raw)) {
                    context.report({ node, messageId: 'literal' });
                }
            },
        };
    },
};

/**
 * Data-derived config belongs on a per-instance builder (packages/modules/src/en/enConfig.js is the
 * reference implementation), not in module-level mutable registries. Guards the
 * anti-pattern's natural home, *Constants.js: reassignable bindings and const-bound
 * mutable collections at the top level.
 */
/** @type {CreateRule} */
const constantsMutableState = {
    meta: {
        messages: {
            mutable:
                'declares top-level mutable state in a *Constants.js file; derive per-instance config via a builder instead (see packages/modules/src/en/enConfig.js, built as a dataset in enDatasets.js)',
        },
    },
    create(context) {
        const collectionNames = new Set(['Map', 'Set', 'WeakMap', 'WeakSet']);
        /** @param {NodeOf<'VariableDeclaration'>} declaration - A top-level declaration. */
        const check = (declaration) => {
            if (declaration.kind !== 'const') {
                context.report({ node: declaration, messageId: 'mutable' });
                return;
            }
            for (const declarator of declaration.declarations) {
                const { init } = declarator;
                if (
                    init?.type === 'NewExpression' &&
                    init.callee.type === 'Identifier' &&
                    collectionNames.has(init.callee.name)
                ) {
                    context.report({ node: declarator, messageId: 'mutable' });
                }
            }
        };
        return {
            'Program > VariableDeclaration': check,
            'Program > ExportNamedDeclaration > VariableDeclaration': check,
        };
    },
};

/**
 * Every UI icon is a Material Symbols glyph rendered through the icon registry
 * (`createIcon`/`iconSvg` of `@tba3/module-base`). The icon font, emoji and hand-written <svg>
 * literals are barred: they paint differently per platform, ignore the theme, or reflow
 * on font load.
 */
/** @type {CreateRule} */
const iconSources = {
    meta: {
        messages: {
            font: 'references the removed Material Icons font; render through createIcon()/iconSvg() of @tba3/module-base',
            emoji: 'uses an emoji as an icon; name a Material Symbols glyph instead',
            svg: 'hand-writes <svg> markup; use iconSvg()/createIcon() from @tba3/module-base',
        },
    },
    create(context) {
        const isRegistry = path.basename(context.filename) === 'icons.js';
        const svgPattern = /<svg\b/;
        /**
         * @param {NodeOf<'Literal'> | NodeOf<'TemplateElement'>} node
         * @param {string} text
         */
        const reportText = (node, text) => {
            if (ICON_FONT_PATTERN.test(text)) context.report({ node, messageId: 'font' });
            if (EMOJI_PATTERN.test(text)) context.report({ node, messageId: 'emoji' });
            if (!isRegistry && svgPattern.test(text)) context.report({ node, messageId: 'svg' });
        };
        return {
            Literal(node) {
                if (typeof node.value === 'string') reportText(node, node.value);
            },
            TemplateElement(node) {
                reportText(node, node.value.raw);
            },
            'Program:exit'() {
                for (const comment of context.sourceCode.getAllComments()) {
                    if (ICON_FONT_PATTERN.test(comment.value)) {
                        context.report({ loc: comment.loc, messageId: 'font' });
                    }
                    if (EMOJI_PATTERN.test(comment.value)) {
                        context.report({ loc: comment.loc, messageId: 'emoji' });
                    }
                }
            },
        };
    },
};

/**
 * HTML strings reach the document only through `setTrustedHTML`, `trustedFragment` or
 * `trusted()` (inside a lit-html template) of `@tba3/module-base`: one greppable call
 * per write, and the only code that holds the page's Trusted Types policy. Raw
 * `innerHTML`/`outerHTML` assignment, `insertAdjacentHTML` and d3's `.html(markup)` are
 * barred everywhere else, and so is creating another policy or importing lit's
 * `unsafeHTML`/`unsafeSVG`/`unsafeMathML`/`unsafeStatic`, which hand any string to lit's
 * own policy.
 */
/** @type {CreateRule} */
const noRawHtmlSink = {
    meta: {
        messages: {
            sink: 'writes HTML through `{{name}}`; use a lit-html template (trusted() for vouched markup), setTrustedHTML() or trustedFragment() from @tba3/module-base (or replaceChildren() to clear)',
            policy: 'creates a Trusted Types policy; the page has exactly two (trustedHtml.js, trustedTypes.js)',
            unsafeDirective:
                'imports lit-html `{{name}}`; render vouched-for markup with trusted() from @tba3/module-base',
        },
    },
    create(context) {
        const file = context.filename.replaceAll('\\', '/');
        if (file.endsWith('/packages/module-base/src/utils/trustedHtml.js')) return {};
        const ownsPolicy = file.endsWith('/src/common/app/trustedTypes.js');
        /**
         * @param {AstNode} member - An assignment target or callee.
         * @returns {string | null} The non-computed member's property name.
         */
        const propertyName = (member) =>
            member?.type === 'MemberExpression' && !member.computed ? member.property.name : null;
        return {
            ImportDeclaration(node) {
                const match = /\/directives\/unsafe-(html|svg|mathml)(?:\.js)?$/.exec(
                    node.source.value,
                );
                if (match) {
                    context.report({
                        node,
                        messageId: 'unsafeDirective',
                        data: { name: match[0].slice(1) },
                    });
                }
                // unsafeStatic splices its string into the template strings themselves,
                // which lit's policy passes as they are.
                if (
                    /^lit(?:\/static-html|-html\/static)(?:\.js)?$/.test(node.source.value) &&
                    node.specifiers.some(
                        (specifier) =>
                            specifier.type === 'ImportSpecifier' &&
                            specifier.imported.type === 'Identifier' &&
                            specifier.imported.name === 'unsafeStatic',
                    )
                ) {
                    context.report({
                        node,
                        messageId: 'unsafeDirective',
                        data: { name: 'unsafeStatic' },
                    });
                }
            },
            AssignmentExpression(node) {
                const name = propertyName(node.left);
                if (name === 'innerHTML' || name === 'outerHTML') {
                    context.report({ node, messageId: 'sink', data: { name } });
                }
            },
            CallExpression(node) {
                const name = propertyName(node.callee);
                if (
                    name === 'insertAdjacentHTML' ||
                    (name === 'html' && node.arguments.length === 1)
                ) {
                    context.report({ node, messageId: 'sink', data: { name } });
                }
                if (!ownsPolicy && name === 'createPolicy') {
                    context.report({ node, messageId: 'policy' });
                }
            },
        };
    },
};

/**
 * A section banner earns its place by naming a domain section, or by marking a step of
 * the module file scan order: constructor/defaults → event handlers → base-class hooks →
 * lifecycle/update → public API → private helpers. A banner made only of construct words
 * says what the declaration under it already says.
 */
const scanOrderLabels = new Set([
    'CONSTRUCTOR',
    'EVENT HANDLERS',
    'BASE CLASS HOOKS',
    'LIFECYCLE',
    'PUBLIC API',
    'PRIVATE HELPERS',
]);
const constructWords = new Set([
    'ABSTRACT',
    'ACCESSORS',
    'AND',
    'API',
    'CALLBACKS',
    'CHART',
    'CLEANUP',
    'CONFIGURATION',
    'CONSTANTS',
    'CONSTRUCTOR',
    'CORE',
    'DEFAULTS',
    'DEFINITIONS',
    'DESTROY',
    'DISPOSABLES',
    'EVENTS',
    'EXTERNAL',
    'FIELDS',
    'FOR',
    'GETTERS',
    'HANDLERS',
    'HELPERS',
    'HOOKS',
    'IMPLEMENTATIONS',
    'INTERNAL',
    'INTERNALS',
    'JSDOC',
    'LIFECYCLE',
    'LISTENERS',
    'MANAGEMENT',
    'METHODS',
    'OF',
    'OPTIONAL',
    'OVERRIDDEN',
    'OVERRIDES',
    'PRIVATE',
    'PROPERTIES',
    'PROTECTED',
    'PUBLIC',
    'REACTIVE',
    'SETTERS',
    'SHARED',
    'SINGLETON',
    'STATE',
    'STATIC',
    'SUBSCRIPTIONS',
    'TEARDOWN',
    'TYPE',
    'TYPES',
    'UTILITIES',
    'UTILITY',
    'UTILS',
    'VIEW',
]);
/** @type {CreateRule} */
const bannerLabelNoise = {
    meta: {
        messages: {
            noise: 'labels a section with a language construct; name the domain section or delete it',
        },
    },
    create(context) {
        // A `//` comment whose text reads as a label rather than a sentence.
        const labelPattern = /^\s*([A-Za-z][A-Za-z0-9 &/_.-]*?)(?:\s*\([^)]*\))?\s*$/;
        return {
            'Program:exit'() {
                for (const comment of context.sourceCode.getAllComments()) {
                    if (comment.type !== 'Line') continue;
                    const match = labelPattern.exec(comment.value);
                    if (!match) continue;
                    const label = match[1]
                        .trim()
                        .toUpperCase()
                        .replace(/^(?:EN|MA|SL)-SPECIFIC\s+/, '');
                    if (scanOrderLabels.has(label)) continue;
                    const words = label.split(/[\s/_.-]+/).filter(Boolean);
                    if (words.length === 0 || !words.every((word) => constructWords.has(word))) {
                        continue;
                    }
                    context.report({ loc: comment.loc, messageId: 'noise' });
                }
            },
        };
    },
};

/** A TODO/FIXME/HACK marker names the ASSUMPTION-<id> it rests on, on the same line. */
/** @type {CreateRule} */
const trackedSourceMarkers = {
    meta: {
        messages: {
            untracked: 'has an untracked TODO/FIXME/HACK marker; reference an ASSUMPTION- ID',
        },
    },
    create(context) {
        return {
            'Program:exit'() {
                for (const comment of context.sourceCode.getAllComments()) {
                    for (const line of comment.value.split('\n')) {
                        if (isUntrackedMarker(line)) {
                            context.report({ loc: comment.loc, messageId: 'untracked' });
                            break;
                        }
                    }
                }
            },
        };
    },
};

/**
 * A comment must stand on its own: a pointer to a document rots silently, and nothing
 * resolves one at build time. Runtime strings are exempt — a console.warn naming the
 * payload contract is addressed to whoever hit it, not to a reader of the source.
 */
/** @type {CreateRule} */
const commentDocReferences = {
    meta: {
        messages: {
            reference: 'references a document from a comment; state the constraint instead',
        },
    },
    create(context) {
        return {
            'Program:exit'() {
                for (const comment of context.sourceCode.getAllComments()) {
                    if (DOC_REFERENCE_PATTERN.test(comment.value)) {
                        context.report({ loc: comment.loc, messageId: 'reference' });
                    }
                }
            },
        };
    },
};

/** Lit's lifecycle hooks module-base owns; a module implements its own hooks instead. */
const finalElementHooks = new Set([
    'connectedCallback',
    'disconnectedCallback',
    'createRenderRoot',
    'shouldUpdate',
    'update',
    'updated',
    'performUpdate',
    'scheduleUpdate',
    'getUpdateComplete',
]);

/**
 * A module is a Lit element (a class extending a `…Module` or `…ViewBase`): a public
 * instance field would shadow the reactive accessor Lit defines on the prototype, so
 * state is `#private` or a declared property; and Lit's lifecycle is module-base's, so a
 * module overrides `_setup`, `_renderContent`/`_renderBody`, `_teardown` rather than
 * `connectedCallback` or `updated`.
 */
/** @type {CreateRule} */
const moduleElementContract = {
    meta: {
        messages: {
            publicField:
                'declares the public field `{{name}}` on a module element; it shadows Lit accessors — use a #private field or a declared property',
            finalHook:
                'overrides `{{name}}`, which module-base owns; implement _setup/_renderContent/_renderBody/_teardown instead',
        },
    },
    create(context) {
        return {
            /** @param {NodeOf<'ClassDeclaration' | 'ClassExpression'>} node */
            'ClassDeclaration, ClassExpression'(node) {
                const base = node.superClass;
                if (base?.type !== 'Identifier' || !/(?:Module|ViewBase)$/.test(base.name)) {
                    return;
                }
                for (const member of node.body.body) {
                    // A static block has no name to check.
                    if (!('key' in member) || member.static || member.key.type !== 'Identifier') {
                        continue;
                    }
                    const { name } = member.key;
                    // A `_protected` field is shared with subclasses, never a reactive property.
                    if (member.type === 'PropertyDefinition' && !name.startsWith('_')) {
                        context.report({ node: member, messageId: 'publicField', data: { name } });
                    } else if (member.type === 'MethodDefinition' && finalElementHooks.has(name)) {
                        context.report({ node: member, messageId: 'finalHook', data: { name } });
                    }
                }
            },
        };
    },
};

/**
 * A number's unit is part of its name, so no comment has to carry it: a time quantity
 * ends in `Ms`, and a numeric constant that measures a length ends in its unit (`_PX`,
 * `_EM`, …). Only names this code declares are checked — bindings, parameters (with the
 * option keys they destructure), class fields and the members of an UPPER_CASE constant —
 * never the keys of an object handed to a library, whose names are the library's. Accessors
 * count as fields; a binding or field that holds a function is named for what it does, as
 * a method is, and is not checked. A camelCase px parameter cannot be told from a count,
 * so `Px` there is the authors' to add; box geometry and DOM/SVG-mirroring fields
 * (`width`, `strokeWidth`) keep the platform's name.
 */
const timeWords = new Set([
    'DEBOUNCE',
    'DELAY',
    'DURATION',
    'GRACE',
    'INTERVAL',
    'LIFETIME',
    'TIMEOUT',
]);
const lengthWords = new Set([
    'BUFFER',
    'DISPLACEMENT',
    'DISTANCE',
    'EXTENT',
    'GAP',
    'HEIGHT',
    'INDENT',
    'INSET',
    'LENGTH',
    'MARGIN',
    'OFFSET',
    'PADDING',
    'PITCH',
    'RADIUS',
    'RISE',
    'SIZE',
    'SLACK',
    'SLOT',
    'SPACING',
    'THICKNESS',
    'THRESHOLD',
    'TOLERANCE',
    'WIDTH',
]);
const upperCaseName = /^[A-Z][A-Z0-9_]*$/;

/**
 * @param {string} name - A camelCase or UPPER_SNAKE name, `#` allowed.
 * @returns {string} Its last word, upper-cased.
 */
function lastWordOf(name) {
    const words = name
        .replace(/^#/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toUpperCase()
        .split(/_+/)
        .filter(Boolean);
    return words.at(-1) ?? '';
}

/**
 * @param {AstNode | null | undefined} node - An initializer.
 * @returns {boolean} A number literal, negated or not.
 */
function isNumberLiteral(node) {
    if (!node) return false;
    if (node.type === 'UnaryExpression' && node.operator === '-') {
        return isNumberLiteral(node.argument);
    }
    return node.type === 'Literal' && typeof node.value === 'number';
}

/**
 * The members of an UPPER_CASE constant's value, at any depth: through nested literals,
 * array elements and the calls that wrap them (`Object.freeze({...})`).
 * @param {AstNode | null | undefined} node - The constant's initializer, or a part of it.
 * @returns {NodeOf<'Property'>[]}
 */
function constantMembers(node) {
    if (node?.type === 'ObjectExpression') {
        return node.properties.flatMap((property) =>
            property.type === 'Property' ? [property, ...constantMembers(property.value)] : [],
        );
    }
    if (node?.type === 'ArrayExpression') return node.elements.flatMap(constantMembers);
    if (node?.type === 'CallExpression') return node.arguments.flatMap(constantMembers);
    return [];
}

/** @type {CreateRule} */
const unitSuffix = {
    meta: {
        messages: {
            time: 'names a time without its unit; end it in Ms (or _MS for a constant), or in Timer for a timer handle',
            length: 'names a length constant without its unit; end it in _PX (or Px), or the unit it is in',
        },
    },
    create(context) {
        /**
         * @param {AstNode} node - Where to report.
         * @param {string} name - The declared name.
         * @param {AstNode | null} [value] - Its initializer, when it has one.
         * @param {boolean} [constant] - Whether the length check applies: an UPPER_CASE constant or a member of one.
         */
        const check = (node, name, value, constant = false) => {
            if (value?.type === 'ArrowFunctionExpression' || value?.type === 'FunctionExpression') {
                return;
            }
            const last = lastWordOf(name);
            if (timeWords.has(last)) {
                context.report({ node, messageId: 'time' });
            } else if (constant && lengthWords.has(last) && isNumberLiteral(value)) {
                context.report({ node, messageId: 'length' });
            }
        };
        /** @param {AstNode | null} pattern - A binding pattern. */
        const checkPattern = (pattern) => {
            if (!pattern) return;
            if (pattern.type === 'Identifier') check(pattern, pattern.name);
            else if (pattern.type === 'AssignmentPattern') checkPattern(pattern.left);
            else if (pattern.type === 'RestElement') checkPattern(pattern.argument);
            else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(checkPattern);
            else if (pattern.type === 'ObjectPattern') {
                for (const property of pattern.properties) {
                    if (property.type === 'RestElement') {
                        checkPattern(property.argument);
                        continue;
                    }
                    const key = keyNameOf(property);
                    const value =
                        property.value.type === 'AssignmentPattern'
                            ? property.value.left
                            : property.value;
                    const renamed = !(value.type === 'Identifier' && value.name === key);
                    // The key is the option's public name; a renamed binding is checked as well.
                    if (key !== null && renamed) check(property.key, key);
                    checkPattern(property.value);
                }
            }
        };
        /**
         * An UPPER_CASE constant and its members. A camelCase member is a record field,
         * often one a library reads: only its time is checked.
         * @param {AstNode} node - Where to report the constant.
         * @param {string} name - The constant's name.
         * @param {AstNode | null} value - Its initializer.
         */
        const checkConstant = (node, name, value) => {
            check(node, name, value, true);
            for (const member of constantMembers(value)) {
                const key = keyNameOf(member);
                if (key !== null) check(member.key, key, member.value, upperCaseName.test(key));
            }
        };
        return {
            VariableDeclarator(node) {
                if (node.id.type !== 'Identifier') checkPattern(node.id);
                else if (upperCaseName.test(node.id.name)) {
                    checkConstant(node.id, node.id.name, node.init);
                } else check(node.id, node.id.name, node.init);
            },
            'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(
                /** @type {NodeOf<'FunctionDeclaration' | 'FunctionExpression' | 'ArrowFunctionExpression'>} */ node,
            ) {
                node.params.forEach(checkPattern);
            },
            PropertyDefinition(node) {
                const name = keyNameOf(node);
                if (name === null) return;
                if (node.static && upperCaseName.test(name))
                    checkConstant(node.key, name, node.value);
                else check(node.key, name, node.value);
            },
            MethodDefinition(node) {
                const name = keyNameOf(node);
                if ((node.kind === 'get' || node.kind === 'set') && name !== null) {
                    check(node.key, name);
                }
            },
        };
    },
};

export default {
    meta: { name: 'tba3' },
    rules: {
        'glossary-copy-ownership': glossaryCopyOwnership,
        'constants-mutable-state': constantsMutableState,
        'icon-sources': iconSources,
        'no-raw-html-sink': noRawHtmlSink,
        'banner-label-noise': bannerLabelNoise,
        'tracked-source-markers': trackedSourceMarkers,
        'comment-doc-references': commentDocReferences,
        'module-element-contract': moduleElementContract,
        'unit-suffix': unitSuffix,
    },
};
