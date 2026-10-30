/**
 * The Tabulator the app instantiates: the core class plus the optional modules the
 * tables use, registered once here (`TabulatorFull` would put all of its modules on
 * every dashboard's critical path).
 *
 * A module missing from this list fails at runtime, not at build time: Tabulator logs
 * a console warning for an option whose module is absent and ignores the option.
 * `ResponsiveLayoutModule` serves `responsiveLayout: 'collapse'`.
 *
 * Registration happens on import, so this module is named in the package's
 * `sideEffects` list: without that a bundler may resolve `Tabulator` straight through
 * to `tabulator-tables` and drop this module, and every table renders with none of its
 * optional modules registered.
 *
 * Tabulator's CSV writer is wrapped here too, for every table's download: a cell whose
 * text a spreadsheet would run as a formula (a student name `=HYPERLINK(…)`) is written
 * as plain text (`csvSafeValue`). The cells are taken after the download accessors, so a
 * number they wrote as text (`-0,5`) stays a number.
 */
import { csvSafeValue } from '@tba3/module-base';
import {
    AccessorModule,
    DownloadModule,
    ExportModule,
    FilterModule,
    FormatModule,
    GroupRowsModule,
    InteractionModule,
    ResizeTableModule,
    ResponsiveLayoutModule,
    SelectRowModule,
    SortModule,
    Tabulator,
} from 'tabulator-tables';

Tabulator.registerModule([
    AccessorModule,
    DownloadModule,
    ExportModule,
    FilterModule,
    FormatModule,
    GroupRowsModule,
    InteractionModule,
    ResizeTableModule,
    ResponsiveLayoutModule,
    SelectRowModule,
    SortModule,
]);

/**
 * A Tabulator downloader: the export list, the download options, and the callback the
 * file's text goes to.
 * @typedef {(this: Tabulator, list: import('tabulator-tables').ExportRow[], options: object, setFileContents: (contents: unknown, mimeType: string) => void) => void} Downloader
 */

const writeCsv = /** @type {{downloaders: {csv: Downloader}}} */ (
    /** @type {unknown} */ (DownloadModule)
).downloaders.csv;

Tabulator.extendModule('download', 'downloaders', {
    /** @type {Downloader} */
    csv(list, options, setFileContents) {
        // Header titles too: a trait code titles its column, and codes come with the data.
        for (const row of list) {
            for (const column of row.columns) {
                if (column) column.value = csvSafeValue(column.value);
            }
        }
        writeCsv.call(this, list, options, setFileContents);
    },
});

export { Tabulator };
