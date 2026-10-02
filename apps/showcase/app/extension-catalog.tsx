"use client";

import * as React from "react";
import { loadExtension, type ExtensionModule } from "./extension-loaders";
import {
  effectLabels,
  matchesCatalogEffectFilters,
  type CatalogEffectFilters,
} from "./catalog-effects";
import { extensionScenarioAdapters, extensionScenarioKey } from "./extension-scenarios";
import type {
  RegisteredManifestExtension,
  RegisteredManifestRequirement,
  RegisteredSystem,
} from "./registry";

type ExtensionEntry = RegisteredManifestExtension;
type Requirement = RegisteredManifestRequirement;

function importPathFor(system: RegisteredSystem, extension: ExtensionEntry): string {
  return `${system.packageName}${extension.entrypoint.replace(/^\./, "")}`;
}

function requirementLabel(requirement: Requirement): string {
  const kind = requirement.kind === "peer" ? "peer" : "dependency";
  const optional = requirement.optional ? " · optional" : "";
  return `${requirement.name}@${requirement.range} · ${kind}${optional}`;
}

function EntryEffectLabels({ effects }: { effects: ExtensionEntry["effects"] }) {
  if (!effects) return <p className="catalog-effect-note">Effects not declared.</p>;
  return (
    <ul className="catalog-effect-tags" aria-label="Declared effects">
      {effectLabels(effects).map((label) => (
        <li key={label}>{label}</li>
      ))}
    </ul>
  );
}

export function CatalogEffectFilters({
  filters,
  onChange,
}: {
  filters: CatalogEffectFilters;
  onChange: (next: CatalogEffectFilters) => void;
}) {
  return (
    <fieldset className="catalog-effect-filters" aria-describedby="catalog-filter-help">
      <legend>Filter by declared effects</legend>
      <div className="catalog-filter-controls">
        <label>
          <input
            type="checkbox"
            checked={filters.motion}
            onChange={(event) => onChange({ ...filters, motion: event.currentTarget.checked })}
          />
          Motion
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.depth}
            onChange={(event) => onChange({ ...filters, depth: event.currentTarget.checked })}
          />
          Depth
        </label>
        <label className="catalog-rendering-filter">
          <span>Rendering</span>
          <select
            value={filters.rendering}
            onChange={(event) =>
              onChange({
                ...filters,
                rendering: event.currentTarget.value as CatalogEffectFilters["rendering"],
              })
            }
          >
            <option value="all">All</option>
            <option value="dom">DOM</option>
            <option value="webgl">WebGL</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
      </div>
      <p id="catalog-filter-help">
        Motion, depth, and rendering are separate filters; selected criteria combine. Items without
        declared effects stay visible until a filter is selected. Contract categories and
        availability do not change.
      </p>
    </fieldset>
  );
}

class PreviewErrorBoundary extends React.Component<
  { system: RegisteredSystem; children: React.ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (this.state.failed) {
      const { Card } = this.props.system.components;
      return (
        <Card>
          <Card.Header>
            <Card.Title>Preview unavailable</Card.Title>
            <Card.Description>
              The selected example could not render in this browser. The package remains the source
              of its own fallback behavior.
            </Card.Description>
          </Card.Header>
        </Card>
      );
    }
    return this.props.children;
  }
}

type ScenarioAdapter = (
  module: ExtensionModule,
  context: { systemId: string; extensionName: string },
) => React.ReactNode;

function ScenarioAdapterRenderer({
  adapter,
  module,
  context,
}: {
  adapter: ScenarioAdapter;
  module: ExtensionModule;
  context: { systemId: string; extensionName: string };
}) {
  return <>{adapter(module, context)}</>;
}

function AdapterPreview({
  adapter,
  module,
  system,
  extensionName,
}: {
  adapter: ScenarioAdapter;
  module: ExtensionModule;
  system: RegisteredSystem;
  extensionName: string;
}) {
  return (
    <PreviewErrorBoundary system={system}>
      <ScenarioAdapterRenderer
        adapter={adapter}
        module={module}
        context={{ systemId: system.id, extensionName }}
      />
    </PreviewErrorBoundary>
  );
}

function usePreviewVisibility(ref: React.RefObject<HTMLElement | null>, active: boolean): boolean {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const target = ref.current;
    if (!target) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "48px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [active, ref]);

  return visible;
}

function ExtensionPreview({
  system,
  extensionName,
  extension,
}: {
  system: RegisteredSystem;
  extensionName: string;
  extension: ExtensionEntry;
}) {
  const key = `${system.id}/${extensionName}`;
  const stageRef = React.useRef<HTMLElement | null>(null);
  const visible = usePreviewVisibility(stageRef, true);
  const [loadResult, setLoadResult] = React.useState<
    | { key: string; status: "loading" }
    | { key: string; status: "ready"; module: ExtensionModule }
    | { key: string; status: "error"; message: string }
    | null
  >(null);

  React.useEffect(() => {
    let current = true;
    setLoadResult({ key, status: "loading" });
    loadExtension(system.id, extensionName).then(
      (module) => {
        if (current) setLoadResult({ key, status: "ready", module });
      },
      (error: unknown) => {
        if (current) {
          setLoadResult({
            key,
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [extensionName, key, system.id]);

  const { Card } = system.components;
  const result = loadResult?.key === key ? loadResult : null;
  const adapter = extensionScenarioAdapters[extensionScenarioKey(system.id, extensionName)];

  return (
    <section
      className="extension-preview"
      ref={stageRef}
      aria-label={`${extensionName} example preview`}
      aria-busy={!result || result.status === "loading"}
    >
      <div className="extension-preview-heading">
        <p className="eyebrow">Selected example</p>
        <code>{extension.example}</code>
      </div>
      {!visible ? (
        <Card>
          <Card.Content>
            <p className="extension-status-copy" role="status">
              Preview paused while this example is outside the viewport.
            </p>
          </Card.Content>
        </Card>
      ) : !result || result.status === "loading" ? (
        <Card>
          <Card.Header>
            <Card.Title>Loading {extensionName}</Card.Title>
            <Card.Description>The selected public entry is loading on demand.</Card.Description>
          </Card.Header>
          <Card.Content>
            <p className="extension-status-copy" role="status" aria-live="polite">
              Loading the selected example.
            </p>
          </Card.Content>
        </Card>
      ) : result.status === "error" ? (
        <Card>
          <Card.Header>
            <Card.Title>Example could not be loaded</Card.Title>
            <Card.Description>
              Check this entrypoint and its required dependencies.
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <p className="extension-status-copy" role="alert">
              {result.message}
            </p>
          </Card.Content>
        </Card>
      ) : !adapter ? (
        <Card>
          <Card.Header>
            <Card.Title>Example adapter not authored</Card.Title>
            <Card.Description>
              The package export loaded successfully. Showcase does not guess props for a new API.
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <p className="extension-status-copy" role="status">
              Add an app-owned scenario adapter after this extension&apos;s public props are known.
              The package&apos;s implementation and visual treatment remain untouched.
            </p>
          </Card.Content>
        </Card>
      ) : (
        <AdapterPreview
          adapter={adapter}
          module={result.module}
          system={system}
          extensionName={extensionName}
        />
      )}
    </section>
  );
}

export function ExtensionCatalog({
  system,
  filters,
}: {
  system: RegisteredSystem;
  filters: CatalogEffectFilters;
}) {
  const extensions = system.manifest.extensions ?? {};
  const entries = Object.entries(extensions).filter(([, extension]) =>
    matchesCatalogEffectFilters(extension.effects ?? null, filters),
  );
  const [opened, setOpened] = React.useState<{ systemId: string; name: string } | null>(null);
  const activeName =
    opened?.systemId === system.id && entries.some(([name]) => name === opened.name)
      ? opened.name
      : null;

  React.useEffect(() => {
    if (opened && activeName === null) setOpened(null);
  }, [activeName, opened]);

  if (Object.keys(extensions).length === 0) return null;

  const { Card, Button } = system.components;
  return (
    <section
      className="extension-catalog component-extension-group"
      id="extensions"
      aria-labelledby="extensions-title"
    >
      <div className="component-extension-heading">
        <div>
          <p className="eyebrow">System extensions</p>
          <h3 id="extensions-title">Purpose-built, package-owned APIs</h3>
        </div>
        <p>
          These exports sit outside the shared contract. Their imports, requirements, effects, and
          examples come from this package&apos;s manifest.
        </p>
      </div>
      {entries.length === 0 ? (
        <Card>
          <Card.Content>
            <p role="status" className="extension-status-copy">
              No system extensions match the selected effect filters. Reset a filter to see every
              declared extension.
            </p>
          </Card.Content>
        </Card>
      ) : (
        <div className="extension-card-grid">
          {entries.map(([name, extension]) => {
            const expanded = activeName === name;
            const importPath = importPathFor(system, extension);
            const entrypoint = system.manifest.entrypoints[extension.entrypoint];
            const requirements = entrypoint?.requirements;
            return (
              <article className="extension-entry" key={name} id={`extension-${system.id}-${name}`}>
                <Card>
                  <Card.Header>
                    <div className="extension-entry-title">
                      <Card.Title>{name}</Card.Title>
                      <span className="extension-api-version">API v{extension.apiVersion}</span>
                    </div>
                    <Card.Description>{extension.description}</Card.Description>
                  </Card.Header>
                  <Card.Content>
                    <dl className="extension-entry-meta">
                      <div>
                        <dt>Import</dt>
                        <dd>
                          <code>{`import { ${name} } from "${importPath}"`}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>Entrypoint</dt>
                        <dd>
                          <code>{extension.entrypoint}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>Requirements</dt>
                        <dd>
                          {requirements === undefined ? (
                            "Not listed in the public manifest."
                          ) : requirements.length === 0 ? (
                            "No additional requirements declared for this entrypoint."
                          ) : (
                            <ul className="extension-requirements">
                              {requirements.map((requirement) => (
                                <li key={`${requirement.name}-${requirement.kind}`}>
                                  {requirementLabel(requirement)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Documentation</dt>
                        <dd>
                          <code>{extension.docs}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>Example</dt>
                        <dd>
                          <code>{extension.example}</code>
                        </dd>
                      </div>
                    </dl>
                    <EntryEffectLabels effects={extension.effects} />
                    <Button
                      type="button"
                      variant="outline"
                      aria-expanded={expanded}
                      aria-controls={`extension-preview-${system.id}-${name}`}
                      onClick={() =>
                        setOpened((current) =>
                          current?.systemId === system.id && current.name === name
                            ? null
                            : { systemId: system.id, name },
                        )
                      }
                    >
                      {expanded ? "Close example" : "Open example"}
                    </Button>
                    <div id={`extension-preview-${system.id}-${name}`} hidden={!expanded}>
                      {expanded && (
                        <ExtensionPreview
                          system={system}
                          extensionName={name}
                          extension={extension}
                        />
                      )}
                    </div>
                  </Card.Content>
                </Card>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
