import { useId, useState, type FormEvent } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DrawerFooter } from "@/components/ui/drawer";
import { ImageInput, type UploadStatus } from "@/components/image-input";
import { SelectCombobox } from "@/components/select-combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getAccountBranches, useAuthStore, type Account } from "@/features/auth/auth-store";
import { useStore } from "@/features/stores/stores-api";
import { API_BASE_URL } from "@/lib/api";
import { type useChangeUser, type UserFields, type UserRecord } from "./users-api";

const profileFields = [
  { name: "fullname", label: "Nama lengkap", type: "text" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Nomor HP", type: "tel" },
] as const;
const textFields = ["username", ...profileFields.map(({ name }) => name), "address"] as const;
const accessOptions = [
  { value: "admin", label: "Admin" },
  { value: "kasir", label: "Kasir" },
];

function BranchField({ store, value, onChange, disabled }: {
  store: NonNullable<Account["store"]>;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  const { data } = useStore();
  const branches = data?.store_id === store.id ? data.store_branch ?? [] : getAccountBranches(store);
  const options = [
    { value: "", label: "Gunakan penempatan bawaan" },
    ...branches.filter(({ id }) => id !== "all").map(({ id, name }) => ({ value: id, label: name })),
  ];

  return (
    <div className="space-y-2">
      <label id={`${id}-label`} htmlFor={id} className="block text-sm font-medium">Cabang</label>
      <SelectCombobox
        id={id}
        aria-labelledby={`${id}-label`}
        options={options}
        value={value}
        onChange={onChange}
        disabled={disabled}
        searchable={false}
      />
    </div>
  );
}

function getUserAccess(user: UserRecord | undefined) {
  if (!user) return "";
  const role = user.user_role?.trim().toLowerCase();
  if (user.is_cashier || role === "kasir") return "kasir";
  if (role === "admin" || role === "administrator" ||
    (!role && (user.user_level_slug || user.user_level || "").toLowerCase().includes("admin"))) return "admin";
  return "";
}

export function UserForm({ user, change, close }: {
  user?: UserRecord;
  change: ReturnType<typeof useChangeUser>;
  close: () => void;
}) {
  const id = useId();
  const store = useAuthStore((state) => state.session?.account.store);
  const canChooseBranch = !user && store?.all_branches === true;
  const [initial] = useState(() => ({
    username: user?.user_username ?? "",
    fullname: user?.user_fullname ?? "",
    email: user?.user_email ?? "",
    phone: user?.user_phone ?? "",
    address: user?.user_address ?? "",
    access: getUserAccess(user),
  }));
  const [access, setAccess] = useState(initial.access);
  const [branchId, setBranchId] = useState("");
  const [savedPhoto] = useState(() => user?.user_foto
    ? new URL(user.user_foto, `${API_BASE_URL.replace(/\/$/, "")}/`).href : "");
  const [photo, setPhoto] = useState(savedPhoto);
  const [image, setImage] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadStatus>({ busy: false, error: "" });
  const [invalidField, setInvalidField] = useState<"username" | "access" | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (change.isPending || upload.busy || upload.error) return;
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    if (!username && (!user || initial.username)) {
      setInvalidField("username");
      return;
    }
    if (!user && !access) {
      setInvalidField("access");
      return;
    }
    const values: UserFields = {};
    for (const field of textFields) {
      const value = String(form.get(field) ?? "").trim();
      if (value !== initial[field].trim()) values[field] = value;
    }
    if (access && access !== initial.access) {
      const isCashier = access === "kasir";
      values.level_user = isCashier ? "Kasir" : "Administrator";
      if (user || isCashier) values.is_cashier = isCashier;
    }
    if (image) values.img = image;

    setInvalidField(null);
    if (user) {
      if (!Object.keys(values).length) {
        close();
        return;
      }
      change.mutate({ action: "edit_user", userId: user.user_id, fields: values }, { onSuccess: close });
    } else {
      const password = String(form.get("password") ?? "");
      change.mutate({
        action: "add_user",
        fields: { ...values, username, password, branch_id: canChooseBranch ? branchId : undefined },
      }, { onSuccess: close });
    }
  }

  const Footer = user ? DrawerFooter : "div";

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-col" autoComplete="off">
      <div className={cn("pb-4", user && "min-h-0 overflow-y-auto px-4")}>
        <fieldset disabled={change.isPending} className="min-w-0 space-y-4">
          <legend className="mb-3 text-sm font-semibold text-muted-foreground">Akun &amp; Akses</legend>
          <div className="space-y-2">
            <label htmlFor={`${id}-username`} className="block text-sm font-medium">Username</label>
            <Input id={`${id}-username`} name="username" defaultValue={initial.username}
              required={!user || !!initial.username}
              aria-invalid={invalidField === "username"}
              aria-describedby={invalidField === "username" ? `${id}-username-error` : undefined}
              onChange={() => { if (invalidField === "username") setInvalidField(null); }} />
            {invalidField === "username" && (
              <p id={`${id}-username-error`} role="alert" className="text-sm text-destructive">Isi username pengguna.</p>
            )}
          </div>
          {!user && (
            <div className="space-y-2">
              <label htmlFor={`${id}-password`} className="block text-sm font-medium">Password (opsional)</label>
              <Input id={`${id}-password`} name="password" type="password" autoComplete="new-password"
                aria-describedby={`${id}-password-help`} />
              <p id={`${id}-password-help`} className="text-xs text-muted-foreground">Pengguna perlu password untuk login.</p>
            </div>
          )}
          <div className="space-y-2">
            <label id={`${id}-access-label`} htmlFor={`${id}-access`} className="block text-sm font-medium">Akses</label>
            <SelectCombobox
              id={`${id}-access`}
              aria-labelledby={`${id}-access-label`}
              aria-describedby={invalidField === "access" ? `${id}-access-error` : undefined}
              options={accessOptions}
              value={access}
              onChange={(value) => {
                setAccess(value);
                if (invalidField === "access") setInvalidField(null);
              }}
              placeholder="Pilih akses"
              disabled={change.isPending}
              invalid={invalidField === "access"}
              searchable={false}
            />
            {invalidField === "access" && (
              <p id={`${id}-access-error`} role="alert" className="text-sm text-destructive">Pilih akses pengguna.</p>
            )}
          </div>
          {canChooseBranch && <BranchField store={store} value={branchId} onChange={setBranchId} disabled={change.isPending} />}
        </fieldset>
        <div className="my-5 border-t" />
        <fieldset disabled={change.isPending} className="min-w-0 space-y-4">
          <legend className="mb-3 text-sm font-semibold text-muted-foreground">Profil</legend>
          {profileFields.map(({ name, label, type }) => (
            <div key={name} className="space-y-2">
              <label htmlFor={`${id}-${name}`} className="block text-sm font-medium">{label}</label>
              <Input id={`${id}-${name}`} name={name} type={type} defaultValue={initial[name]} />
            </div>
          ))}
          <div className="space-y-2">
            <label htmlFor={`${id}-address`} className="block text-sm font-medium">Alamat</label>
            <Textarea id={`${id}-address`} name="address" defaultValue={initial.address} />
          </div>
          <ImageInput id={`${id}-image`} label="Foto profil" value={photo} onChange={(source) => setPhoto(source || savedPhoto)}
            onFileChange={setImage} onStatusChange={setUpload} removable={!!image} />
        </fieldset>
        {change.error && (
          <p role="alert" className="mt-4 text-sm text-destructive">{change.error.message}</p>
        )}
      </div>
      <Footer className={cn("grid shrink-0 grid-cols-2 gap-2 border-t", !user && "pt-4")}>
        <Button variant="outline" type="button" disabled={change.isPending} onClick={close}>Batal</Button>
        <Button type="submit" disabled={upload.busy || !!upload.error} loading={change.isPending}>Simpan</Button>
      </Footer>
    </form>
  );
}
