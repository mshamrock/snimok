/** Timeline view modes, remembered per browser in a cookie. */
export const VIEW_COOKIE = "snimok_view";

export type ViewMode = "large" | "medium" | "small" | "list";

export const VIEWS: { id: ViewMode; label: string; icon: string }[] = [
  { id: "large", label: "Large tiles", icon: "grid-lg" },
  { id: "medium", label: "Medium tiles", icon: "grid" },
  { id: "small", label: "Small tiles", icon: "grid-sm" },
  { id: "list", label: "List", icon: "list" },
];

export function isViewMode(v: unknown): v is ViewMode {
  return v === "large" || v === "medium" || v === "small" || v === "list";
}

export function viewMode(v: unknown): ViewMode {
  return isViewMode(v) ? v : "medium";
}

/** Captures per page: denser views load more. */
export const PAGE_SIZE: Record<ViewMode, number> = {
  large: 30,
  medium: 60,
  small: 120,
  list: 60,
};
