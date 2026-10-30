import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import plugin from '../../../config/oxlintPlugin.mjs';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { sourceType: 'module' } });

tester.run('no-raw-html-sink', plugin.rules['no-raw-html-sink'], {
    valid: [
        "import { html, render } from 'lit';",
        "import { repeat } from 'lit/directives/repeat.js';",
        "import { trusted } from '@tba3/module-base';",
        "import { html, literal } from 'lit/static-html.js';",
        {
            name: 'the policy module itself writes innerHTML',
            filename: '/repo/packages/module-base/src/utils/trustedHtml.js',
            code: 'template.innerHTML = trusted(html);',
        },
    ],
    invalid: [
        {
            code: "import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';",
            errors: [{ messageId: 'unsafeDirective' }],
        },
        {
            code: "import { unsafeSVG } from 'lit-html/directives/unsafe-svg.js';",
            errors: [{ messageId: 'unsafeDirective' }],
        },
        {
            code: "import { unsafeHTML } from 'lit/directives/unsafe-html.js';",
            errors: [{ messageId: 'unsafeDirective' }],
        },
        {
            code: "import { html, unsafeStatic } from 'lit/static-html.js';",
            errors: [{ messageId: 'unsafeDirective' }],
        },
        {
            code: "import { unsafeStatic } from 'lit-html/static.js';",
            errors: [{ messageId: 'unsafeDirective' }],
        },
        {
            name: 'trusted() is the only exit, not the module that owns the policy',
            filename: '/repo/packages/module-base/src/utils/trustedDirective.js',
            code: "import { unsafeHTML } from 'lit/directives/unsafe-html.js';",
            errors: [{ messageId: 'unsafeDirective' }],
        },
        { code: 'element.innerHTML = markup;', errors: [{ messageId: 'sink' }] },
        {
            code: "element.insertAdjacentHTML('beforeend', markup);",
            errors: [{ messageId: 'sink' }],
        },
        { code: "trustedTypes.createPolicy('x', {});", errors: [{ messageId: 'policy' }] },
    ],
});

tester.run('glossary-copy-ownership', plugin.rules['glossary-copy-ownership'], {
    valid: [
        "const card = { glossaryKey: 'en.student.tables', showModuleTitle: true };",
        {
            name: 'a data-derived choice carries its own label',
            code: "const item = { value: 'ho', label: domainLabels[0] };",
        },
        {
            name: 'a label without a glossary key beside it is data vocabulary',
            code: "const row = { key: 'box', label: 'Box' };",
        },
        'module.setTitle(group.name);',
        {
            name: 'a chart host takes data-driven options',
            code: "ChartHostModule.createChart('id', config, this._childOptions({ domainMode }));",
        },
    ],
    invalid: [
        {
            name: 'a prefixed key (infoGlossaryKey) owns the copy beside it too',
            code: "const card = { infoGlossaryKey: 'en.student.student-row', title: 'Schülerübersicht' };",
            errors: [{ messageId: 'besideKey' }],
        },
        {
            name: 'a keyed header choice takes its label from the glossary',
            code: "const item = { value: 'all', label: 'Alle', glossarySubKey: 'domain-all' };",
            errors: [{ messageId: 'besideKey' }],
        },
        {
            name: "a chart host's key sits in its config, so its options own no copy",
            code: "ChartHostModule.createChart('id', config, { title: 'Verteilung' });",
            errors: [{ messageId: 'besideKey' }],
        },
        {
            name: 'keyed chart options report their copy once',
            code: "ChartHostModule.createChart('id', config, { glossaryKey: 'x', title: 'Verteilung' });",
            errors: [{ messageId: 'besideKey' }],
        },
        {
            name: 'nor do the options a child-options call builds',
            code: "ChartHostModule.createChart('id', config, this._childOptions({ legend: { label: 'Stufen' } }));",
            errors: [{ messageId: 'besideKey' }],
        },
        { code: "module.setTitle('Übersicht');", errors: [{ messageId: 'setter' }] },
        {
            code: "element.setAttribute('aria-label', 'Schließen');",
            errors: [{ messageId: 'literal' }],
        },
    ],
});

tester.run('unit-suffix', plugin.rules['unit-suffix'], {
    valid: [
        'const DELAY_MS = 100;',
        'const GAP_PX = 4;',
        "const ICON = Object.freeze({ SIZE_RATIO: 0.18, LABEL: 'x' });",
        'const { durationMs } = options;',
        'function wait({ timeoutMs = 50 } = {}) {}',
        'class Popup { #hoverTimer = null; }',
        {
            name: 'a camelCase length is box geometry or a record field, not a constant',
            code: 'const gap = 4;',
        },
        {
            name: 'a length constant computed at load names no literal',
            code: 'const WIDTH = measure();',
        },
        {
            name: 'a key a library reads is no declaration',
            code: 'requestIdleCallback(warm, { timeout: 2000 });',
        },
        {
            name: 'a function inside a constant declares no member of it',
            code: 'const HANDLERS = { onHide: () => ({ GAP: 4 }) };',
        },
        {
            name: 'a binding or field holding a function is named like a method',
            code: 'const resolveDelay = (base) => base * 2; class Popup { onTimeout = () => {}; }',
        },
    ],
    invalid: [
        { code: 'const DELAY = 100;', errors: [{ messageId: 'time' }] },
        { code: 'let hoverDelay = 0;', errors: [{ messageId: 'time' }] },
        { code: 'function fade(duration) {}', errors: [{ messageId: 'time' }] },
        { code: 'const fade = ([duration]) => duration;', errors: [{ messageId: 'time' }] },
        { code: 'const { duration } = options;', errors: [{ messageId: 'time' }] },
        {
            name: 'a renamed binding still exposes the option key without its unit',
            code: 'const { duration: durationMs } = options;',
            errors: [{ messageId: 'time' }],
        },
        { code: 'class Popup { static GRACE = 150; }', errors: [{ messageId: 'time' }] },
        { code: 'class Popup { get interval() { return 1; } }', errors: [{ messageId: 'time' }] },
        { code: 'class Popup { set delay(value) {} }', errors: [{ messageId: 'time' }] },
        {
            name: 'a camelCase member of a constant is checked for its time only',
            code: 'const MOTION = Object.freeze({ hover: { duration: 150, size: 4 } });',
            errors: [{ messageId: 'time' }],
        },
        { code: 'const GAP = 4;', errors: [{ messageId: 'length' }] },
        { code: 'const OFFSET = -2;', errors: [{ messageId: 'length' }] },
        {
            code: 'const BAND = Object.freeze({ PADDING: 2, LABEL_WIDTH: 40 });',
            errors: [{ messageId: 'length' }, { messageId: 'length' }],
        },
        { code: 'class Ring { static RADIUS = 8; }', errors: [{ messageId: 'length' }] },
        {
            name: 'a quoted class field is named like any other',
            code: "class Popup { static 'DELAY' = 100; }",
            errors: [{ messageId: 'time' }],
        },
        {
            name: 'members are found through nested literals, arrays and wrapping calls',
            code: 'const LAYOUT = { rows: [Object.freeze({ GAP: 4 })], inner: { PADDING: 2 } };',
            errors: [{ messageId: 'length' }, { messageId: 'length' }],
        },
    ],
});

tester.run('module-element-contract', plugin.rules['module-element-contract'], {
    valid: [
        'class Card extends ContentModule { #rows = []; static properties = { data: {} }; }',
        'class Base extends MaLayoutViewBase { _splitGrid = null; }',
        'class Card extends ContentModule { _renderBody() {} willUpdate() {} }',
        {
            name: 'a plain class keeps its fields',
            code: 'class Tracker { count = 0; update() {} }',
        },
    ],
    invalid: [
        {
            name: 'a public field shadows the reactive accessor Lit defines',
            code: 'class Card extends ContentModule { data = null; }',
            errors: [{ messageId: 'publicField' }],
        },
        {
            code: 'class View extends BaseViewModule { connectedCallback() {} }',
            errors: [{ messageId: 'finalHook' }],
        },
        {
            code: 'const Card = class extends ContentModule { updated() {} };',
            errors: [{ messageId: 'finalHook' }],
        },
    ],
});
