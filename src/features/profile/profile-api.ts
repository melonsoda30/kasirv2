import { request } from "../../lib/api";
import { getAuthSession, useAuthStore } from "../auth/auth-store";
import { readSessionTokens, type SessionTokenResponse } from "../auth/session-tokens";

const profileFields = ["username", "fullname", "email", "phone", "address"] as const;
type ProfileFields = Record<(typeof profileFields)[number], string>;
export type ProfileInput = Partial<ProfileFields> & { image?: File | null };
type SavedProfile = ProfileFields & { id: string; img: string; store_id: string; branch_id: string };

// Both roles use the authenticated user's own profile.
const profileUrl = "/profile/profile";

async function postProfile<T>(action: string, data: FormData, fallback: string) {
  data.set("action", action);
  const response = await request<{ status: string; msg?: string; data?: T }>({
    url: profileUrl,
    method: "POST",
    data,
  });
  if (response?.status !== "success") throw new Error(response?.msg || fallback);
  return response;
}

export async function saveProfile(input: ProfileInput) {
  const data = new FormData();
  if (input.image) data.set("img", input.image, input.image.name);
  for (const field of profileFields) {
    const value = input[field];
    if (value !== undefined) data.set(field, value.trim());
  }
  const response = await postProfile<SavedProfile>("edit_profile", data, "Gagal menyimpan profil.");
  if (!response.data) throw new Error("Data profil tidak tersedia dari server.");
  return { profile: response.data, message: response.msg };
}

export async function verifyCurrentPassword(password: string) {
  const data = new FormData();
  data.set("pass", password);
  await postProfile("old_pass", data, "Gagal mengonfirmasi password sekarang.");
}

export async function changePassword(password: string) {
  const session = getAuthSession();
  if (!session) throw new Error("Sesi berakhir. Silakan login kembali.");
  const data = new FormData();
  data.set("pass", password);
  const response = await postProfile<SessionTokenResponse>("new_pass", data, "Gagal mengganti password.");

  const { replaceSessionTokens, clearSession } = useAuthStore.getState();
  if (useAuthStore.getState().session?.token !== session.token) return;
  try {
    if (!response.data) throw new Error();
    const tokens = readSessionTokens(response.data);
    if (!tokens.refresh) throw new Error();
    replaceSessionTokens(session.token, tokens);
  } catch {
    clearSession();
    throw new Error("Password sudah diganti. Silakan login kembali.");
  }
}
