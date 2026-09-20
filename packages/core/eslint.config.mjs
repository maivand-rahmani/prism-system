// Package lint config. It re-exports the repository-level flat ESLint config so
// `eslint .` from this package uses the same rules as the rest of the monorepo.
export { default } from "../../eslint.config.mjs";
