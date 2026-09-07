import { redirect } from "next/navigation";
import { dayKeyIn, getTimeZone } from "@/lib/tz";

/** /recap → this year's recap in the viewer's time zone. */
export default async function RecapIndex() {
  const tz = await getTimeZone();
  redirect(`/recap/${dayKeyIn(new Date(), tz).slice(0, 4)}`);
}
