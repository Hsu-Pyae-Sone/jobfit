import { Studio } from "@/components/studio/Studio";

export const metadata = { title: "Studio" };

export default async function StudioWorkspacePage({ params }: PageProps<"/studio/[id]">) {
  const { id } = await params;
  return <Studio id={id} />;
}
