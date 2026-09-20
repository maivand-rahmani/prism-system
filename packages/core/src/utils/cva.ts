/**
 * Re-export of the CVA conventions used by design systems in this monorepo.
 *
 * Core does not define any variants itself; it only guarantees that every
 * system builds variant APIs from the same primitive.
 */
export { cva, type VariantProps } from "class-variance-authority";
