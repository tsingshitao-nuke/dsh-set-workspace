/**
 * dsh-set-workspace — host half.
 *
 * Pure UI plugin: no host-side behavior. All functionality lives in the
 * browser client bundle shipped via `exports["./client"]` and discovered
 * through the package.json `dsh.client` declaration. The empty apply keeps
 * the plugin visible to the host loader while the browser half registers
 * the file-tree panel and its "Set as workspace" context action.
 * @module dsh-set-workspace
 */
export function apply() { }
//# sourceMappingURL=index.js.map