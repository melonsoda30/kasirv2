import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../auth/auth-store";
import { fetchCategories } from "./category-api";

export function useProductCategories(enabled = true) {
  const account = useAuthStore((state) => state.session?.account);
  return useQuery({
    queryKey: ["product-categories", account?.store?.id, account?.account_username],
    queryFn: ({ signal }) => fetchCategories(signal),
    enabled: enabled && !!account,
  });
}

export function useCanManageCategories() {
  const account = useAuthStore((state) => state.session?.account);
  return [account?.account_role, account?.event_level, account?.account_level]
    .some((value) => /^(admin|administrator)$/i.test(value?.trim() ?? ""));
}
