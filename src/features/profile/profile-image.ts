import { API_BASE_URL } from "@/lib/api";

const pageVersion = Date.now();

export function profileImageUrl(path?: string, version = 0) {
  if (!path) return "";
  const url = new URL(path, `${API_BASE_URL.replace(/\/$/, "")}/`);
  url.searchParams.set("profile_v", String(Math.max(pageVersion, version)));
  return url.href;
}
