"use client";

import * as React from "react";
import { loadExtension, type ExtensionModule } from "./extension-loaders";
import { extensionScenarioAdapters, extensionScenarioKey } from "./extension-scenarios";
import type { RegisteredSystem } from "./registry";

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
          <Card.Content>
            <p className="extension-status-copy" role="alert">
              This preview could not be rendered.
            </p>
          </Card.Content>
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
}: {
  system: RegisteredSystem;
  extensionName: string;
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
      aria-label={`${extensionName} preview`}
      aria-busy={!result || result.status === "loading"}
    >
      {!visible ? (
        <Card>
          <Card.Content>
            <p className="extension-status-copy" role="status">
              Preview paused.
            </p>
          </Card.Content>
        </Card>
      ) : !result || result.status === "loading" ? (
        <Card>
          <Card.Content>
            <p className="extension-status-copy" role="status" aria-live="polite">
              Loading preview…
            </p>
          </Card.Content>
        </Card>
      ) : result.status === "error" ? (
        <Card>
          <Card.Content>
            <p className="extension-status-copy" role="alert">
              Preview unavailable: {result.message}
            </p>
          </Card.Content>
        </Card>
      ) : !adapter ? (
        <Card>
          <Card.Content>
            <p className="extension-status-copy" role="status">
              No Showcase scenario is available for this extension yet.
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

export function ExtensionCatalog({ system }: { system: RegisteredSystem }) {
  const extensions = system.manifest.extensions ?? {};
  const entries = Object.entries(extensions);
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
        <h2 id="extensions-title">Extensions</h2>
      </div>
      <div className="extension-card-grid">
        {entries.map(([name]) => {
          const expanded = activeName === name;
          return (
            <article className="extension-entry" key={name} id={`extension-${system.id}-${name}`}>
              <Card padding="sm">
                <div className="extension-entry-heading">
                  <Card.Title>{name}</Card.Title>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
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
                    {expanded ? "Hide preview" : "Preview"}
                  </Button>
                </div>
                <div id={`extension-preview-${system.id}-${name}`} hidden={!expanded}>
                  {expanded && <ExtensionPreview system={system} extensionName={name} />}
                </div>
              </Card>
            </article>
          );
        })}
      </div>
    </section>
  );
}
