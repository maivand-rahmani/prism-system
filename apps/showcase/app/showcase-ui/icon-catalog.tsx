"use client";

import * as React from "react";
import {
  ICON_CATEGORIES,
  ICON_NAMES,
  iconExportName,
  iconNameFromExportName,
  isIconName,
  type IconName,
} from "@prism-system/ui-core";
import { hasIconCatalog, loadIcons, type IconModule } from "../icon-loaders";
import type { RegisteredSystem } from "../registry";

const ICON_ENTRYPOINT = "./icons";

function catalogIconNames(system: RegisteredSystem): readonly IconName[] {
  const exports = system.manifest.publicApi[ICON_ENTRYPOINT] ?? [];
  const available = new Set(
    exports.map((name) => iconNameFromExportName(name)).filter((name) => isIconName(name)),
  );
  return ICON_NAMES.filter((name) => available.has(name));
}

function iconImportPath(system: RegisteredSystem): string {
  return `${system.packageName}${ICON_ENTRYPOINT.slice(1)}`;
}

/**
 * Read-only catalog of the icons the selected design system really publishes.
 *
 * Availability comes only from the validated manifest `publicApi["./icons"]`
 * and the generated literal loader; the app never guesses a package path or
 * imports package internals. Icon drawing, color, size, and optional motion
 * remain entirely inside the design system.
 */
export function IconCatalog({ system }: { system: RegisteredSystem }) {
  const { Input } = system.components;
  const names = React.useMemo(() => catalogIconNames(system), [system]);
  const declared = hasIconCatalog(system.id) && names.length > 0;
  const importPath = iconImportPath(system);
  const [module, setModule] = React.useState<IconModule | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    setModule(null);
    setError(null);
    if (!declared) return;
    let cancelled = false;
    loadIcons(system.id)
      .then((loaded) => {
        if (cancelled) return;
        const missing = names.filter((name) => !(iconExportName(name) in loaded));
        if (missing.length > 0) {
          setError(
            `The installed icon module is missing ${missing.length} declared export(s): ` +
              `${missing.map(iconExportName).join(", ")}.`,
          );
        }
        setModule(loaded);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "The icon catalog could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [declared, names, system.id]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = names.filter((name) => name.toLowerCase().includes(normalizedQuery));
  const groups = Object.entries(ICON_CATEGORIES)
    .map(([key, categoryNames]) => ({
      key,
      names: categoryNames.filter((name) => filtered.includes(name)),
    }))
    .filter((group) => group.names.length > 0);
  const importExample = filtered[0] ?? names[0];

  return (
    <section className="icon-catalog component-view" id="icons" aria-labelledby="icons-title">
      <div className="view-heading component-view-heading">
        <h1 id="icons-title">Icons</h1>
        <p className="catalog-hint">
          {declared
            ? `${names.length} of ${ICON_NAMES.length} canonical icons published by this system`
            : "This system publishes no icon catalog"}
        </p>
      </div>

      {!declared ? (
        <p className="empty-capability-note" role="status">
          This design system does not declare an icon catalog. Absence is valid; no icon is
          available from this package.
        </p>
      ) : (
        <>
          <div className="icon-catalog-toolbar">
            <label htmlFor="showcase-icon-filter">Find an icon</label>
            <Input
              id="showcase-icon-filter"
              type="search"
              value={query}
              placeholder="Search by canonical name"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setQuery(event.target.value)
              }
            />
            <span role="status" aria-live="polite">
              {filtered.length} matching {filtered.length === 1 ? "icon" : "icons"}
            </span>
          </div>

          <p className="icon-catalog-import">
            Public import:{" "}
            <code>
              {importExample
                ? `import { ${iconExportName(importExample)} } from "${importPath}"`
                : "No icon selected"}
            </code>
          </p>

          {error !== null && (
            <p className="icon-catalog-status icon-catalog-status--error" role="alert">
              {error}
            </p>
          )}

          {module === null && error === null && (
            <p className="icon-catalog-status" role="status">
              Loading icons…
            </p>
          )}

          {module !== null && filtered.length === 0 && (
            <p className="empty-capability-note" role="status">
              No icon matches “{query}”.
            </p>
          )}

          {module !== null &&
            groups.map((group) => (
              <section
                className="icon-category"
                key={group.key}
                aria-labelledby={`icon-category-${group.key}`}
              >
                <h2 id={`icon-category-${group.key}`}>{group.key}</h2>
                <ul className="icon-grid">
                  {group.names.map((name) => {
                    const Icon = module[iconExportName(name)];
                    if (Icon === undefined) {
                      return (
                        <li className="icon-tile is-unavailable" key={name}>
                          <span className="icon-tile-name">{name}</span>
                          <code className="icon-tile-import">{iconExportName(name)}</code>
                          <span className="icon-catalog-status icon-catalog-status--error">
                            Missing export
                          </span>
                        </li>
                      );
                    }
                    return (
                      <li className="icon-tile" key={name}>
                        <span className="icon-tile-glyph">
                          <Icon size={28} aria-hidden="true" />
                        </span>
                        <span className="icon-tile-name">{name}</span>
                        <code className="icon-tile-import">{iconExportName(name)}</code>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
        </>
      )}
    </section>
  );
}
