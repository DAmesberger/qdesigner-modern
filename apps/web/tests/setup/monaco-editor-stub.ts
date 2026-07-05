// Test stub for `monaco-editor`.
//
// The real package's entry does not resolve under vitest's vite transform, and
// the Monaco editor is never exercised in the jsdom component tests (the script
// tab lazy-loads it only in a real browser). Components import monaco lazily via
// `await import('monaco-editor')`; aliasing it here keeps those component graphs
// resolvable without pulling the editor into the test bundle.
export default {};
