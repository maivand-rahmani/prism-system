import manifest from "../../../../../config/design-systems.json";
import { notFound } from "next/navigation";
import { Showcase } from "../../showcase";

export function generateStaticParams() {
  return manifest.designSystems.map((system) => ({ id: system.id }));
}

export default async function ShowcaseSystemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!manifest.designSystems.some((system) => system.id === id)) notFound();
  return <Showcase initialSystemId={id} />;
}
