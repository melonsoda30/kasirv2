import { useId, useState, type FormEvent } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { DrawerFooter } from "@/components/ui/drawer";
import { ImageInput, type UploadStatus } from "@/components/image-input";
import { SelectCombobox } from "@/components/select-combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getAccountBranches,
  useAuthStore,
  type Account,
} from "@/features/auth/auth-store";
import { useStore } from "@/features/stores/stores-api";
import { API_BASE_URL } from "@/lib/api";
import {
  type useChangeUser,
  type UserFields,
  type UserRecord,
} from "./users-api";

const profileFields = [
  { name: "fullname", label: "Nama lengkap", type: "text" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Nomor HP", type: "tel" },
] as const;
const textFields = [
  ...profileFields.map(({ name }) => name),
  "address",
] as const;
const cashierLevel = "Kasir";

function BranchField({
  store,
  value,
  onChange,
  disabled,
  editing = false,
  invalid = false,
}: {
  store: NonNullable<Account["store"]>;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  editing?: boolean;
  invalid?: boolean;
}) {
  const id = useId();
  const { data, isLoading } = useStore();
  const branches =
    data?.store_id === store.id
      ? (data.store_branch ?? [])
      : getAccountBranches(store);
  const options = branches
    .filter(({ id }) => id && id !== "all" && (store.all_branches || id === store.branch_id))
    .map(({ id, name }) => ({ value: id, label: name }));
  if (editing && value && !options.some((option) => option.value === value)) {
    options.unshift({ value, label: value === "all" ? "Semua cabang" : value });
  }

  return (
    <div className="space-y-2">
      <label
        id={`${id}-label`}
        htmlFor={id}
        className="block text-sm font-medium"
      >
        Cabang
        {!editing && <span aria-hidden="true"> *</span>}
      </label>
      {isLoading && branches.length === 0 ? (
        <SkeletonGroup label="Memuat cabang">
          <Skeleton className="h-10 w-full" />
        </SkeletonGroup>
      ) : (
        <SelectCombobox
          id={id}
          aria-labelledby={`${id}-label`}
          aria-describedby={invalid ? `${id}-error` : undefined}
          options={options}
          value={value}
          placeholder="Pilih cabang"
          onChange={onChange}
          disabled={disabled || options.length === 0}
          invalid={invalid}
          searchable={false}
        />
      )}
      {invalid && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          Pilih cabang pengguna.
        </p>
      )}
    </div>
  );
}

function getUserAccessLabel(user: UserRecord | undefined) {
  if (!user) return cashierLevel;
  const role = user.user_role?.trim().toLowerCase();
  if (user.is_cashier || role === "kasir") return cashierLevel;
  if (
    role === "admin" ||
    role === "administrator" ||
    (!role &&
      (user.user_level_slug || user.user_level || "")
        .toLowerCase()
        .includes("admin"))
  )
    return "Administrator";
  return user.user_level || "—";
}

export function UserForm({
  user,
  change,
  close,
}: {
  user?: UserRecord;
  change: ReturnType<typeof useChangeUser>;
  close: () => void;
}) {
  const id = useId();
  const store = useAuthStore((state) => state.session?.account.store);
  const canChooseBranch = store?.all_branches === true;
  const [initial] = useState(() => ({
    username: user?.user_username ?? "",
    fullname: user?.user_fullname ?? "",
    email: user?.user_email ?? "",
    phone: user?.user_phone ?? "",
    address: user?.user_address ?? "",
    branchId: user?.user_branch_id ?? "",
  }));
  const [branchId, setBranchId] = useState(initial.branchId);
  const [savedPhoto] = useState(() =>
    user?.user_foto
      ? new URL(user.user_foto, `${API_BASE_URL.replace(/\/$/, "")}/`).href
      : "",
  );
  const [photo, setPhoto] = useState(savedPhoto);
  const [image, setImage] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadStatus>({
    busy: false,
    error: "",
  });
  const [invalidUsername, setInvalidUsername] = useState(false);
  const [invalidBranch, setInvalidBranch] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (change.isPending || upload.busy || upload.error) return;
    const form = new FormData(event.currentTarget);
    const username = user ? initial.username.trim() : String(form.get("username") ?? "").trim();
    if (!username) {
      setInvalidUsername(true);
      return;
    }
    if (!user && (!store || !branchId)) {
      setInvalidBranch(true);
      return;
    }
    const values: UserFields = {};
    for (const field of textFields) {
      const value = String(form.get(field) ?? "").trim();
      if (user ? value !== initial[field].trim() : value) values[field] = value;
    }
    if (image) values.img = image;

    setInvalidUsername(false);
    if (user) {
      if (canChooseBranch && branchId !== initial.branchId) values.branch_id = branchId;
      if (!Object.keys(values).length) return;
      change.mutate(
        { action: "edit_user", userId: user.user_id, fields: { ...values, username } },
        { onSuccess: close },
      );
    } else {
      const password = String(form.get("password") ?? "");
      change.mutate(
        {
          action: "add_user",
          fields: {
            ...values,
            username,
            password,
            level_user: cashierLevel,
            is_cashier: true,
            branch_id: branchId,
          },
        },
        { onSuccess: close },
      );
    }
  }

  const Footer = user ? DrawerFooter : "div";
  const formId = `${id}-form`;

  return (
    <>
      <form
        id={formId}
        onSubmit={submit}
        className={user ? "modal-body" : "pb-4"}
        autoComplete="off"
      >
        <fieldset disabled={change.isPending} className="min-w-0 space-y-4">
          <legend className="mb-3 text-sm font-semibold text-muted-foreground">
            Akun &amp; Akses
          </legend>
          <div className="space-y-2">
            <label
              htmlFor={`${id}-username`}
              className="block text-sm font-medium"
            >
              Username
            </label>
            <Input
              id={`${id}-username`}
              name="username"
              defaultValue={initial.username}
              disabled={!!user}
              required={!user}
              aria-invalid={invalidUsername}
              aria-describedby={
                invalidUsername ? `${id}-username-error` : undefined
              }
              onChange={() => {
                if (invalidUsername) setInvalidUsername(false);
              }}
            />
            {invalidUsername && (
              <p
                id={`${id}-username-error`}
                role="alert"
                className="text-sm text-destructive"
              >
                {user ? "Username pengguna belum tersedia." : "Isi username pengguna."}
              </p>
            )}
          </div>
          {!user && (
            <div className="space-y-2">
              <label
                htmlFor={`${id}-password`}
                className="block text-sm font-medium"
              >
                Password
              </label>
              <Input
                id={`${id}-password`}
                name="password"
                type="password"
                autoComplete="new-password"
                aria-describedby={`${id}-password-help`}
              />
              <p
                id={`${id}-password-help`}
                className="text-xs text-muted-foreground"
              >
                Pengguna perlu password untuk login.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <label
              htmlFor={`${id}-access`}
              className="block text-sm font-medium"
            >
              Akses
            </label>
            <Input id={`${id}-access`} value={getUserAccessLabel(user)} disabled />
          </div>
          {store && (!user || canChooseBranch) && (
            <BranchField
              store={store}
              value={branchId}
              onChange={(value) => {
                setBranchId(value);
                setInvalidBranch(false);
              }}
              disabled={change.isPending}
              editing={!!user}
              invalid={invalidBranch}
            />
          )}
          {!user && !store && (
            <p role="status" className="text-sm text-muted-foreground">Cabang akun belum tersedia.</p>
          )}
        </fieldset>
        <div className="my-5 border-t" />
        <fieldset disabled={change.isPending} className="min-w-0 space-y-4">
          <legend className="mb-3 text-sm font-semibold text-muted-foreground">
            Profil
          </legend>
          {profileFields.map(({ name, label, type }) => (
            <div key={name} className="space-y-2">
              <label
                htmlFor={`${id}-${name}`}
                className="block text-sm font-medium"
              >
                {label}
              </label>
              <Input
                id={`${id}-${name}`}
                name={name}
                type={type}
                defaultValue={initial[name]}
              />
            </div>
          ))}
          <div className="space-y-2">
            <label
              htmlFor={`${id}-address`}
              className="block text-sm font-medium"
            >
              Alamat
            </label>
            <Textarea
              id={`${id}-address`}
              name="address"
              defaultValue={initial.address}
            />
          </div>
          <ImageInput
            id={`${id}-image`}
            label="Foto profil"
            value={photo}
            onChange={(source) => setPhoto(source || savedPhoto)}
            onFileChange={setImage}
            onStatusChange={setUpload}
            removable={!!image}
          />
        </fieldset>
        {change.error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {change.error.message}
          </p>
        )}
      </form>
      <Footer className={cn(!user && "border-t pt-4")}>
        <div className={user ? "modal-actions" : "grid grid-cols-2 gap-2"}>
          <Button
            variant="outline"
            type="button"
            disabled={change.isPending}
            onClick={close}
          >
            Batal
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={upload.busy || !!upload.error}
            loading={change.isPending}
          >
            Simpan
          </Button>
        </div>
      </Footer>
    </>
  );
}
