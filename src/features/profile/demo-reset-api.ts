import { request } from "../../lib/api";
import { getAdminBranch, getAuthSession, getBranchFilterId, isAdminMode, useAuthStore } from "../auth/auth-store";
import { useOrderStore } from "../orders/order-store";

interface DemoResetResponse {
  status: string;
  msg?: string;
  data?: { branch_reset?: { store_id: string; branch_id: string; branch_name: string }[] };
}

export async function resetDemoData() {
  if (!isAdminMode(getAuthSession())) throw new Error("Reset hanya tersedia dalam mode admin.");
  const { sessionVersion } = useAuthStore.getState();
  const data = new FormData();
  data.set("action", "reset_demo");
  const response = await request<DemoResetResponse>({
    url: "/admin/reset.php",
    method: "POST",
    data,
    timeout: 60_000,
  });
  if (response?.status !== "success") throw new Error(response?.msg || "Gagal mereset data demo.");

  const auth = useAuthStore.getState();
  if (!auth.session || auth.sessionVersion !== sessionVersion) return false;
  const store = auth.session.account.store;
  const branches = response.data?.branch_reset;
  const branch = Array.isArray(branches)
    ? branches.find(({ store_id }) => store_id === store?.id)
    : undefined;
  if (store && branch?.branch_id && branch.branch_name) {
    if (auth.session.cashierBranchId) auth.setCashierBranch();
    auth.updateAccount({
      store: {
        ...store,
        branch_id: getBranchFilterId(store.branch_id) ? branch.branch_id : store.branch_id,
        branches: [{ id: branch.branch_id, name: branch.branch_name }],
      },
    });
    if (!getAdminBranch(useAuthStore.getState().session)) auth.setAdminBranch(branch.branch_id);
  }
  useOrderStore.setState(useOrderStore.getInitialState());
  return true;
}
