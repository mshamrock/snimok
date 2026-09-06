import { FacetPage } from "@/components/FacetPage";
import { tagCounts } from "@/lib/captures";
import { libraryOwner } from "@/lib/library";

export const metadata = { title: "Tags" };

export default async function TagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ owner }, sp] = await Promise.all([libraryOwner("/tags"), searchParams]);
  const q = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const facets = await tagCounts(owner);
  return <FacetPage kind="tag" facets={facets} q={q} />;
}
