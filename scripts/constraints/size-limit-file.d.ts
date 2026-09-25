// @size-limit/file ships no types. Typed as the plugin list size-limit's API accepts.
declare module "@size-limit/file" {
  const plugins: ((...args: unknown[]) => unknown)[];
  export default plugins;
}
