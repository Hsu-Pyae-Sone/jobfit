import { MatchDetail } from "@/components/match/MatchDetail";

export const metadata = { title: "Job Match" };

export default async function Page({ params }: PageProps<"/match/[id]">) {
  const { id } = await params;
  return <MatchDetail id={id} />;
}
