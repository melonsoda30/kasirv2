import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { PageLayout } from "@/components/page-layout";
import { getAuthSession } from "@/features/auth/auth-store";
import { UserForm } from "@/features/users/user-form";
import { canManageUsers, useChangeUser } from "@/features/users/users-api";

export const Route = createFileRoute("/users_/tambah")({
  beforeLoad: () => {
    if (!canManageUsers(getAuthSession()?.account)) {
      throw redirect({ to: "/users", replace: true });
    }
  },
  component: AddUserPage,
});

function AddUserPage() {
  const navigate = useNavigate();
  const change = useChangeUser();

  function close() {
    change.reset();
    void navigate({ to: "/users" });
  }

  return (
    <PageLayout title="Tambah pengguna" prevLink="/users">
      <UserForm change={change} close={close} />
    </PageLayout>
  );
}
