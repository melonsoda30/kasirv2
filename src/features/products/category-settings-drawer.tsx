import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Pencil, Plus, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  addCategory,
  deleteCategory,
  editCategory,
  type Category,
  type CategoryInput,
} from "./category-api";
import type { useProductCategories } from "./use-product-categories";

type ManageableCategory = Category & {
  category_id: NonNullable<Category["category_id"]>;
};
type Editor =
  | { type: "save"; category?: ManageableCategory }
  | { type: "delete"; category: ManageableCategory };
type Change =
  | { type: "save"; input: CategoryInput; category?: ManageableCategory }
  | Extract<Editor, { type: "delete" }>;

function CategorySummary({ category }: { category: Category }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="break-words font-medium">{category.category_name}</p>
      <p className="text-xs text-muted-foreground">
        {category.product_count} produk
      </p>
    </div>
  );
}

export function CategorySettingsDrawer({
  categories,
}: {
  categories: ReturnType<typeof useProductCategories>;
}) {
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [validationError, setValidationError] = useState("");
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: async (action: Change) => {
      if (action.type === "delete")
        return deleteCategory(action.category.category_id);
      if (action.category)
        return editCategory(action.category.category_id, action.input);
      return addCategory(action.input);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["product-categories"] }),
        queryClient.invalidateQueries({ queryKey: ["products", "catalog"] }),
      ]);
      setEditor(null);
    },
  });
  const error = isAxiosError<{ msg?: string }>(change.error)
    ? change.error.response?.data?.msg || "Gagal menyimpan perubahan kategori."
    : change.error?.message;

  function showEditor(next: Editor | null) {
    change.reset();
    setValidationError("");
    setEditor(next);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (change.isPending || editor?.type !== "save") return;
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get("name") ?? "").trim();
    if (!name) {
      setValidationError("Isi nama kategori.");
      return;
    }
    setValidationError("");
    change.mutate({
      type: "save",
      category: editor.category,
      input: { name },
    });
  }

  return (
    <Drawer
      open={open}
      dismissible={!change.isPending}
      onOpenChange={(next) => {
        if (!next) showEditor(null);
        setOpen(next);
      }}
    >
      <DrawerTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label="Pengaturan kategori"
        >
          <Settings aria-hidden="true" />
        </Button>
      </DrawerTrigger>
      <DrawerContent
        aria-describedby={undefined}
        className="product-drawer pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      >
        <DrawerHeader className="shrink-0">
          <DrawerTitle>
            {editor?.type === "save"
              ? editor.category
                ? "Edit kategori"
                : "Tambah kategori"
              : "Pengaturan kategori"}
          </DrawerTitle>
        </DrawerHeader>
        <div className="min-h-0 space-y-6 overflow-y-auto px-4 py-4">
          {editor?.type === "save" ? (
            <form
              id="category-settings-form"
              onSubmit={save}
              className="space-y-6"
            >
              <fieldset
                disabled={change.isPending}
                className="min-w-0 space-y-6"
              >
                <div className="space-y-2">
                  <label
                    htmlFor="category-name"
                    className="text-sm font-medium"
                  >
                    Nama kategori
                  </label>
                  <Input
                    id="category-name"
                    name="name"
                    defaultValue={editor.category?.category_name}
                    required
                  />
                </div>
              </fieldset>
              {(validationError || error) && (
                <p role="alert" className="text-destructive">
                  {validationError || error}
                </p>
              )}
            </form>
          ) : (
            <>
              {categories.isPending && <p role="status">Memuat kategori...</p>}
              {categories.isError && (
                <div className="space-y-2">
                  <p role="alert" className="text-destructive">
                    Gagal memuat daftar kategori.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    loading={categories.isFetching}
                    onClick={() => void categories.refetch()}
                  >
                    Coba lagi
                  </Button>
                </div>
              )}
              {categories.data?.length === 0 && (
                <p className="text-muted-foreground">Belum ada kategori.</p>
              )}
              <ul className="divide-y">
                {categories.data?.map((category) => {
                  const id = category.category_id;
                  return (
                    <li
                      key={category.category_slug}
                      className="flex items-center gap-2 py-3"
                    >
                      <CategorySummary category={category} />
                      {id !== null && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Edit kategori ${category.category_name}`}
                            onClick={() =>
                              showEditor({
                                type: "save",
                                category: { ...category, category_id: id },
                              })
                            }
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                          <Dialog
                            open={
                              editor?.type === "delete" &&
                              editor.category.category_id === id
                            }
                            onOpenChange={(next) => {
                              if (!change.isPending)
                                showEditor(
                                  next
                                    ? {
                                        type: "delete",
                                        category: {
                                          ...category,
                                          category_id: id,
                                        },
                                      }
                                    : null,
                                );
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label={`Hapus kategori ${category.category_name}`}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Hapus kategori?</DialogTitle>
                                <DialogDescription className="mb-4">
                                  Kategori {category.category_name} akan
                                  dihapus.
                                </DialogDescription>
                                {error && (
                                  <p role="alert" className="text-destructive">
                                    {error}
                                  </p>
                                )}
                                <Button
                                  type="button"
                                  variant="destructive"
                                  loading={change.isPending}
                                  onClick={() =>
                                    change.mutate({
                                      type: "delete",
                                      category: {
                                        ...category,
                                        category_id: id,
                                      },
                                    })
                                  }
                                >
                                  Hapus kategori
                                </Button>
                              </DialogHeader>
                            </DialogContent>
                          </Dialog>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        <DrawerFooter className="shrink-0">
          {editor?.type === "save" ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={change.isPending}
                onClick={() => showEditor(null)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                form="category-settings-form"
                loading={change.isPending}
              >
                Simpan
              </Button>
            </div>
          ) : (
            <Button type="button" onClick={() => showEditor({ type: "save" })}>
              <Plus aria-hidden="true" /> Tambah kategori
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
