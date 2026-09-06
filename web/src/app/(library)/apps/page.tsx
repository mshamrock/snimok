import { FacetPage } from "@/components/FacetPage";
import { appCounts } from "@/lib/captures";
import { libraryOwner } from "@/lib/library";

export const metadata = { title: "Apps" };

export default async function AppsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ owner }, sp] = await Promise.all([libraryOwner("/apps"), searchParams]);
  const q = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const facets = await appCounts(owner);
  return <FacetPage kind="app" facets={facets} q={q} />;
}
