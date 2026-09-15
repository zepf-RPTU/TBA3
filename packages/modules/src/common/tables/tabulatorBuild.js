/**
 * The one Tabulator the app instantiates: the core class plus exactly the optional
 * modules the tables use, registered once here. `TabulatorFull` registers all 37 and
 * put every one of them on the critical path of each dashboard through the shared
 * content-module chunk.
 *
 * A module missing from this list fails at runtime, not at build time — Tabulator's
 * dependency registry logs a console warning for an option whose module is absent, and
 * the option is silently ignored. Two entries are easy to miss when auditing the option
 * surface: `TooltipModule` serves `headerTooltip` on the trait sub-columns in
 * `packages/modules/src/sl/modules/tables/slColumnBuilders.js`, and `ResponsiveLayoutModule` serves
 * `responsiveLayout: 'collapse' | 'hide'` in the EN student table and the SL class and
 * domain tables.
 *
 * Registration happens on import, which makes this the one module in the package with a
 * side effect — and why it is named in the package's `sideEffects` list. Without that a
 * bundler may resolve `Tabulator` straight through to `tabulator-tables` and drop this
 * module, and every table then renders with none of its optional modules registered.
 */
import {
    AccessorModule,
    ColumnCalcsModule,
    DataTreeModule,
    DownloadModule,
    ExportModule,
    FilterModule,
    FormatModule,
    GroupRowsModule,
    InteractionModule,
    MoveColumnsModule,
    ResizeTableModule,
    ResponsiveLayoutModule,
    SelectRowModule,
    SortModule,
    Tabulator,
    TooltipModule,
} from 'tabulator-tables';

Tabulator.registerModule([
    AccessorModule,
    ColumnCalcsModule,
    DataTreeModule,
    DownloadModule,
    ExportModule,
    FilterModule,
    FormatModule,
    GroupRowsModule,
    InteractionModule,
    MoveColumnsModule,
    ResizeTableModule,
    ResponsiveLayoutModule,
    SelectRowModule,
    SortModule,
    TooltipModule,
]);

export { Tabulator };
