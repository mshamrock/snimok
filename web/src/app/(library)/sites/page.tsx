import { FacetPage } from "@/components/FacetPage";
import { siteCounts } from "@/lib/captures";
import { libraryOwner } from "@/lib/library";

export const metadata = { title: "Sites" };

export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ owner }, sp] = await Promise.all([libraryOwner("/sites"), searchParams]);
  const q = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const facets = await siteCounts(owner);
  return <FacetPage kind="site" facets={facets} q={q} />;
}
