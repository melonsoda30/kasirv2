import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { useAuthStore } from "@/features/auth/auth-store";
import { isEmptyListResponse, request } from "@/lib/api";

export interface UserRecord {
  user_store_name: string;
  user_store_id: string;
  user_branch_id: string;
  user_fullname: string;
  user_id: string;
  user_foto: string;
  user_level: string;
  user_level_slug: string;
  user_role: string;
  user_status: "active" | "noactive";
  is_cashier: boolean;
  user_username?: string;
  user_email?: string;
  user_phone?: string;
  user_address?: string;
}

export type UserFields = {
  username?: string;
  fullname?: string;
  email?: string;
  phone?: string;
  address?: string;
  level_user?: string;
  is_cashier?: boolean;
  branch_id?: string;
  img?: File;
};

export type UserChange =
  | { action: "add_user"; fields: UserFields & { username: string; password?: string } }
  | { action: "edit_user"; userId: string; fields: UserFields }
  | { action: "status_user"; userId: string; status: UserRecord["user_status"] };

type UserChangeResponse = {
  status?: string;
  msg?: string;
  data?: { user_id?: string; store_id?: string; branch_id?: string };
};

const usersUrl = "/admin/setting";
const messages = {
  add_user: { error: "Gagal menambah pengguna.", success: "Pengguna berhasil ditambahkan." },
  edit_user: { error: "Gagal mengubah pengguna.", success: "Pengguna berhasil diperbarui." },
  status_user: { error: "Gagal mengubah status pengguna.", success: "Status pengguna berhasil diperbarui." },
};

export function userDisplayName(user: UserRecord) {
  return user.user_fullname || user.user_username || user.user_id;
}

export { isAdminAccount as canManageUsers } from "@/features/auth/auth-store";

export async function fetchUsers(signal?: AbortSignal): Promise<UserRecord[]> {
  const response = await request<{
    status?: string;
    msg?: string;
    data?: UserRecord[];
  } | null>({
    url: usersUrl,
    method: "GET",
    params: { action: "list_user" },
    signal,
  });
  if (isEmptyListResponse(response)) return [];
  if (response?.status !== "success" || !Array.isArray(response.data)) {
    throw new Error(response?.msg || "Gagal memuat daftar pengguna.");
  }
  if (response.data.some((user) => typeof user?.user_id !== "string" || !user.user_id.trim())) {
    throw new Error("ID pengguna dari server tidak valid.");
  }
  return response.data;
}

export async function changeUser(change: UserChange) {
  const photo = change.action !== "status_user" ? change.fields.img : undefined;
  const data = photo ? new FormData() : new URLSearchParams();
  data.set("action", change.action);
  if (change.action !== "add_user") data.set("user_id", change.userId);
  if (change.action === "status_user") {
    data.set("status", change.status);
  } else {
    const { fields } = change;
    for (const field of ["username", "fullname", "email", "phone", "address", "level_user"] as const) {
      if (fields[field] !== undefined) data.set(field, fields[field].trim());
    }
    if (fields.is_cashier !== undefined) data.set("is_cashier", fields.is_cashier ? "1" : "0");
    const branchId = fields.branch_id?.trim();
    if (branchId || (change.action === "edit_user" && branchId !== undefined)) data.set("branch_id", branchId);
    if (change.action === "add_user") {
      const { password } = change.fields;
      if (password) data.set("password", password);
    }
    if (data instanceof FormData && photo) data.set("img", photo, photo.name);
  }

  const fallback = messages[change.action].error;
  let response: UserChangeResponse | null;
  try {
    response = await request<UserChangeResponse | null>({ url: usersUrl, method: "POST", data });
  } catch (error) {
    if (!isAxiosError<UserChangeResponse>(error)) throw error;
    throw new Error(error.response?.data?.msg || fallback, { cause: error });
  }
  if (response?.status !== "success") throw new Error(response?.msg || fallback);
  return response;
}

function useUsersQueryKey() {
  const username = useAuthStore((state) => state.session?.account.account_username);
  return ["admin", "users", username] as const;
}

export function useUsers(enabled = true) {
  const queryKey = useUsersQueryKey();
  return useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchUsers(signal),
    enabled: enabled && !!queryKey[2],
    meta: { toast: false },
  });
}

export function useChangeUser() {
  const queryClient = useQueryClient();
  const queryKey = useUsersQueryKey();
  return useMutation({
    mutationFn: changeUser,
    gcTime: 0,
    scope: { id: JSON.stringify(queryKey) },
    onSuccess: async (_, change) => {
      await queryClient.invalidateQueries({ queryKey, exact: true });
      toast.success(messages[change.action].success);
    },
    meta: { toast: false },
  });
}
