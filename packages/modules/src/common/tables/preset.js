/**
 * Preset class for table filter and sort configurations
 * Ensures that all presets have required properties and valid structure
 */
export class Preset {
    /**
     * Creates a new Preset instance
     * @param {object} config - Preset configuration
     * @param {string} config.label - Display label for the preset button
     * @param {Array} config.sort - Sort configuration (required, must have at least one sort)
     * @param {Array} [config.filters] - Optional filter configurations
     * @param {number} [config.limit] - Optional row limit
     * @param {string} [config.tooltipText] - Optional hover tooltip text
     * @param {boolean} [config.disabled] - Render the button as disabled and ignore its clicks
     */
    constructor(config) {
        if (!config.label || typeof config.label !== 'string') {
            throw new Error('Preset must have a valid label');
        }

        if (!config.sort || !Array.isArray(config.sort) || config.sort.length === 0) {
            throw new Error('Preset must have at least one sort configuration');
        }

        if (config.tooltipText !== undefined && typeof config.tooltipText !== 'string') {
            throw new Error('Preset tooltipText must be a string when provided');
        }

        // Validate sort structure
        config.sort.forEach((sort, index) => {
            if (!sort.column || typeof sort.column !== 'string') {
                throw new Error(
                    `Sort configuration at index ${index} must have a valid column name`,
                );
            }
            if (!sort.dir || !['asc', 'desc'].includes(sort.dir)) {
                throw new Error(
                    `Sort configuration at index ${index} must have dir set to 'asc' or 'desc'`,
                );
            }
        });

        this.label = config.label;
        this.sort = config.sort;
        this.filters = config.filters || [];
        this.limit = config.limit || null;
        this.tooltipText = config.tooltipText || null;
        this.disabled = config.disabled === true;

        // Validate filters if provided
        if (this.filters.length > 0) {
            this.filters.forEach((filter, index) => {
                if (!filter.field && filter.type !== 'custom') {
                    throw new Error(
                        `Filter at index ${index} must have a field property (unless type is 'custom')`,
                    );
                }
                if (!filter.type) {
                    throw new Error(`Filter at index ${index} must have a type property`);
                }
                if (filter.value === undefined) {
                    throw new Error(`Filter at index ${index} must have a value property`);
                }
            });
        }

        // Validate limit if provided
        if (this.limit !== null && (typeof this.limit !== 'number' || this.limit <= 0)) {
            throw new Error('Preset limit must be a positive number or null');
        }
    }
}
