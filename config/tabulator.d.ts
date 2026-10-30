/**
 * What TBA3 reads of Tabulator beyond `@types/tabulator-tables`: the table's build and
 * teardown flags (a resize or a click can land inside either window), and the internal
 * Column behind a component, whose width bounds the header-floor pass sets without a
 * redraw per column.
 */
// oxlint-disable-next-line import/no-unassigned-import -- an augmentation imports what it augments
import 'tabulator-tables';

declare module 'tabulator-tables' {
    interface Tabulator {
        /** Set once the table's first build has finished. */
        readonly initialized: boolean;
        /** Set by `destroy()`. */
        readonly destroyed: boolean;
    }

    interface ColumnComponent {
        /** The internal Column the component wraps. */
        _getSelf(): {
            minWidth: number;
            setMinWidth(width: number): void;
            setWidth(width: number): void;
        };
    }
}
