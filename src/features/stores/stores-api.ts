import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useAuthStore, type Branch } from "@/features/auth/auth-store";
import type { StoreRecord } from "@/features/products/store-api";
import { isEmptyListResponse, request } from "@/lib/api";

export type AdminStore = Omit<StoreRecord, "store_days">;
export type BranchChange =
  | { action: "add_branch"; name: string }
  | { action: "edit_branch"; name: string; branchId: string }
  | { action: "delete_branch"; branchId: string };

type BranchResponse = {
  status?: string;
  msg?: string;
  data?: { branch?: Branch; branches?: Branch[]; used_by?: string[] };
};

const storeUrl = "/admin/store";
const branchErrors = {
  add_branch: "Gagal menambah cabang.",
  edit_branch: "Gagal mengubah cabang.",
  delete_branch: "Gagal menghapus cabang.",
};

async function fetchStore(signal: AbortSignal): Promise<AdminStore | null> {
  const response = await request<AdminStore[] | { status?: string; msg?: string; data?: AdminStore[] } | null>({
    url: storeUrl,
    method: "GET",
    params: { action: "list_store", status: "all", search: "" },
    signal,
  });

  if (isEmptyListResponse(response)) return null;
  if (Array.isArray(response)) return response[0] ?? null;
  if (response?.status === "success" && Array.isArray(response.data)) return response.data[0] ?? null;
  throw new Error(response?.msg || "Gagal memuat daftar toko.");
}

function useStoreQueryKey() {
  const username = useAuthStore((state) => state.session?.account.account_username);
  const storeId = useAuthStore((state) => state.session?.account.event_id);
  return ["admin", "stores", username, storeId] as const;
}

export function useStore() {
  const queryKey = useStoreQueryKey();
  return useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchStore(signal),
    enabled: !!queryKey[2],
    meta: { toast: false },
  });
}

export async function saveBranch(storeId: string, change: BranchChange) {
  const data = new FormData();
  data.set("action", change.action);
  data.set("store_id", storeId);
  if (change.action !== "add_branch") data.set("branch_id", change.branchId);
  if (change.action !== "delete_branch") data.set("name", change.name);

  const fallback = branchErrors[change.action];
  let response: BranchResponse | null;
  try {
    response = await request<BranchResponse | null>({ url: storeUrl, method: "POST", data });
  } catch (error) {
    if (!isAxiosError<BranchResponse>(error)) throw error;
    throw new Error(branchErrorMessage(error.response?.data, fallback), { cause: error });
  }

  if (response?.status !== "success") {
    throw new Error(branchErrorMessage(response, fallback));
  }
  return response.data;
}

function branchErrorMessage(response: BranchResponse | null | undefined, fallback: string) {
  if (response?.msg) return response.msg;
  const usedBy = response?.data?.used_by;
  if (Array.isArray(usedBy) && usedBy.length) {
    return `Cabang masih digunakan oleh ${usedBy.join(", ")} dan tidak bisa dihapus.`;
  }
  return fallback;
}

export function useSaveBranch(storeId: string) {
  const queryClient = useQueryClient();
  const queryKey = useStoreQueryKey();
  return useMutation({
    mutationFn: (change: BranchChange) => saveBranch(storeId, change),
    onSuccess: async (data, change) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData<AdminStore | null>(queryKey, (store) => {
        if (!store || store.store_id !== storeId) return store;
        const current = store.store_branch ?? [];
        if (Array.isArray(data?.branches)) return { ...store, store_branch: data.branches };

        switch (change.action) {
          case "add_branch": {
            const branch = data?.branch;
            return branch ? { ...store, store_branch: [...current.filter(({ id }) => id !== branch.id), branch] } : store;
          }
          case "edit_branch":
            return { ...store, store_branch: current.map((branch) => branch.id === change.branchId
              ? { ...branch, name: data?.branch?.name ?? change.name }
              : branch) };
          case "delete_branch":
            return { ...store, store_branch: current.filter(({ id }) => id !== change.branchId) };
        }
      });
      await queryClient.invalidateQueries({ queryKey, exact: true });
    },
    meta: { toast: { success: "Perubahan cabang berhasil disimpan.", error: false } },
  });
}
