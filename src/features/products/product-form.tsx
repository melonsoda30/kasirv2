import { useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputNominal } from "@/components/input-nominal";
import { SelectCombobox } from "@/components/select-combobox";
import { Errors } from "@/components/errors";
import { getErrorMessages } from "@/lib/error-messages";
import { Textarea } from "@/components/ui/textarea";
import { discountTypes } from "./sample-products";
import { getAccountBranches, useAuthStore } from "@/features/auth/auth-store";
import { useProductCatalog } from "./use-product-catalog";
import { saveProduct } from "./product-api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addCategory } from "./category-api";
import { useCanManageCategories, useProductCategories } from "./use-product-categories";
import { isAxiosError } from "axios";
import type { Product } from "./sample-products";
import { productSchema } from "./product-schema";
import { Plus, X } from "lucide-react";
import { ImageInput, type UploadStatus } from "@/components/image-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const fieldLabels: Record<string, string> = {
  category: "Kategori",
  store: "Store",
  photo: "Foto produk",
  title: "Nama produk",
  price: "Harga",
  discountType: "Jenis diskon",
  discount: "Nominal diskon",
  description: "Deskripsi",
};

export function ProductForm({ product }: { product?: Product }) {
  const categoryInput = useRef<HTMLInputElement>(null);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<
    { field: string; messages: string[] }[]
  >([]);
  const navigate = useNavigate();
  const account = useAuthStore((state) => state.session?.account);
  const queryClient = useQueryClient();
  const catalog = useProductCatalog();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const storeOptions = getAccountBranches(account?.store).map((branch) => ({
    value: branch.id,
    label: branch.name,
  }));
  const currentStore = product
    ? product.branchId || product.storeId
    : account?.store?.branch_id;
  const defaultStore = storeOptions.find(({ value }) => value === currentStore)?.value
    ?? (!product && storeOptions.length === 1 ? storeOptions[0].value : "");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    busy: false,
    error: "",
  });
  const [selectedCategory, setSelectedCategory] = useState(
    product?.category ?? "",
  );
  const canManageCategories = useCanManageCategories();
  const categories = useProductCategories();
  const availableCategories = categories.data?.filter(
    (item) => item.category_status === "active" || item.category_slug === product?.category,
  ) ?? [];
  const selectedName = categories.data?.find(
    (item) => item.category_slug === selectedCategory,
  )?.category_name;
  const addCategoryMutation = useMutation({
    mutationFn: addCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["product-categories"] }),
    onError: (error) => {
      const message = isAxiosError<{ msg?: string }>(error)
        ? error.response?.data?.msg || "Gagal menambah kategori."
        : error.message;
      toast.error(message);
    },
  });

  const form = useForm({
    defaultValues: {
      category: product?.category ?? "",
      store: defaultStore,
      title: product?.title ?? "",
      price: product ? String(product.price) : "",
      photo:
        product?.photo ||
        (product?.image
          ? `https://images.unsplash.com/${product.image}?auto=format&fit=crop&w=640&q=80`
          : ""),
      discount: product?.discount ? String(product.discount) : "",
      discountType: product?.discountType || discountTypes[0],
      description: product?.description ?? "",
    },
    validators: {
      onSubmit: productSchema.superRefine((_value, context) => {
        if (_value.category && !selectedCategory)
          context.addIssue({
            code: "custom",
            path: ["category"],
            message: "Pilih kategori dari daftar atau tekan tombol tambah kategori.",
          });
        if (!storeOptions.some((option) => option.value === _value.store))
          context.addIssue({
            code: "custom",
            path: ["store"],
            message: "Pilih store dari daftar.",
          });
        if (uploadStatus.error)
          context.addIssue({
            code: "custom",
            path: ["photo"],
            message: uploadStatus.error,
          });
      }),
    },
    onSubmitInvalid: ({ formApi }) => {
      const errors = Object.entries(formApi.getAllErrors().fields)
        .map(([field, result]) => ({
          field,
          messages: getErrorMessages(result?.errors ?? []),
        }))
        .filter((item) => item.messages.length > 0);
      setSubmitErrors(errors);
      setErrorDialogOpen(true);
    },
    onSubmit: async ({ value }) => {
      if (uploadStatus.busy || uploadStatus.error || saving || addCategoryMutation.isPending) return;
      const parsed = productSchema.parse(value);
      const matchingCategory = availableCategories.find((item) => item.category_slug === parsed.category)
        ?? availableCategories.find((item) => item.category_name.toLowerCase() === parsed.category.toLowerCase());
      setSaving(true);
      try {
        const message = await saveProduct({
          menuId: product?.id,
          eventId: parsed.store,
          category: matchingCategory?.category_slug ?? parsed.category,
          image: imageFile,
          name: parsed.title,
          price: parsed.price,
          description: parsed.description.trim(),
          discount: parsed.discount,
          discountType: parsed.discountType,
        });
        await queryClient.invalidateQueries({
          queryKey: ["products", "catalog"],
        });
        toast.success(message);
        await navigate({ to: "/produk" });
      } catch (error) {
        let message = error instanceof Error ? error.message : "Gagal menyimpan produk.";
        if (isAxiosError<{ msg?: string }>(error)) {
          message = error.response?.data?.msg || "Gagal menyimpan produk. Silakan coba lagi.";
        }
        toast.error(message);
      } finally {
        setSaving(false);
      }
    },
  });

  return (
    <>
      <form
        noValidate
        className="bento-surface space-y-6 p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <fieldset disabled={saving} className="min-w-0 space-y-6">
          <form.Field name="category">
            {(field) => (
              <div className="space-y-2">
                <label
                  htmlFor="product-category"
                  className="text-sm font-medium"
                >
                  Kategori <span aria-hidden="true">*</span>
                </label>
                <div className="flex gap-2">
                  <Input
                    ref={categoryInput}
                    id="product-category"
                    name={field.name}
                    value={selectedName ?? field.state.value}
                    disabled={!canManageCategories || !!selectedCategory || addCategoryMutation.isPending}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    placeholder={canManageCategories ? "Ketik kategori baru" : "Pilih kategori"}
                    aria-required
                    aria-invalid={!field.state.meta.isValid}
                    aria-describedby="category-error"
                  />
                  {selectedCategory ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Batal memilih kategori dan ketik kategori baru"
                      onClick={() => {
                        setSelectedCategory("");
                        field.handleChange("");
                        requestAnimationFrame(() =>
                          categoryInput.current?.focus(),
                        );
                      }}
                    >
                      <X />
                    </Button>
                  ) : canManageCategories && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Tambah kategori"
                      loading={addCategoryMutation.isPending}
                      disabled={!field.state.value.trim()}
                      onClick={() => {
                        const name = field.state.value.trim();
                        const existingCategory = availableCategories.find(
                          (item) => item.category_name.toLowerCase() === name.toLowerCase(),
                        );
                        const selectCategory = (category: string) => {
                          field.handleChange(category);
                          setSelectedCategory(category);
                          field.handleBlur();
                        };
                        if (existingCategory) {
                          selectCategory(existingCategory.category_slug);
                        } else {
                          addCategoryMutation.mutate(
                            { name },
                            { onSuccess: (result) => selectCategory(result?.category_slug ?? name) },
                          );
                        }
                      }}
                    >
                      <Plus />
                    </Button>
                  )}
                </div>
                {categories.isPending && (
                  <p role="status" className="text-sm text-muted-foreground">
                    Memuat kategori...
                  </p>
                )}
                {categories.isError && (
                  <div className="space-y-2">
                    <p role="alert" className="text-sm text-destructive">
                      Gagal memuat daftar kategori.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={categories.isFetching}
                      onClick={() => void categories.refetch()}
                    >
                      Coba lagi
                    </Button>
                  </div>
                )}
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Kategori yang tersedia"
                >
                  {availableCategories.map(({ category_slug: category, category_name: name }) => (
                    <Button
                      key={category}
                      type="button"
                      size="sm"
                      className="rounded-full"
                      variant={
                        selectedCategory === category ? "default" : "outline"
                      }
                      aria-pressed={selectedCategory === category}
                      disabled={addCategoryMutation.isPending}
                      onClick={() => {
                        const next =
                          selectedCategory === category ? "" : category;
                        field.handleChange(next);
                        setSelectedCategory(next);
                        field.handleBlur();
                      }}
                    >
                      {name}
                    </Button>
                  ))}
                </div>
                <Errors id="category-error" errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <form.Field name="store">
            {(field) => (
              <div className="space-y-2">
                <label htmlFor="product-store" className="text-sm font-medium">
                  Store <span aria-hidden="true">*</span>
                </label>
                <SelectCombobox
                  id="product-store"
                  aria-label="Store"
                  aria-describedby={
                    storeOptions.length ? "product-store-error" : "product-store-empty"
                  }
                  options={storeOptions}
                  disabled={saving || storeOptions.length === 0}
                  value={field.state.value}
                  placeholder="Pilih store"
                  emptyMessage="Tidak ada store yang cocok."
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  invalid={!field.state.meta.isValid}
                />
                {storeOptions.length === 0 && (
                  <p id="product-store-empty" className="text-sm text-muted-foreground">
                    Akun ini belum memiliki cabang yang tersedia.
                  </p>
                )}
                <Errors
                  id="product-store-error"
                  errors={field.state.meta.errors}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="photo">
            {(field) => (
              <ImageInput
                id="product-photo"
                value={field.state.value}
                onChange={field.handleChange}
                onStatusChange={setUploadStatus}
                onFileChange={setImageFile}
              />
            )}
          </form.Field>

          <form.Field name="title">
            {(field) => (
              <div className="space-y-2">
                <label htmlFor="product-title" className="text-sm font-medium">
                  Nama produk <span aria-hidden="true">*</span>
                </label>
                <Input
                  id="product-title"
                  name={field.name}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-required
                  aria-invalid={!field.state.meta.isValid}
                  aria-describedby="title-error"
                />
                <Errors id="title-error" errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <form.Field name="price">
            {(field) => (
              <div className="space-y-2">
                <label htmlFor="product-price" className="text-sm font-medium">
                  Harga <span aria-hidden="true">*</span>
                </label>
                <InputNominal
                  id="product-price"
                  name={field.name}
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  onBlur={field.handleBlur}
                  aria-required
                  aria-invalid={!field.state.meta.isValid}
                  aria-describedby="price-error"
                />
                <Errors id="price-error" errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <fieldset className="min-w-0 space-y-2">
            <legend className="mb-2 text-sm font-medium">Diskon</legend>
            <form.Field name="discountType">
              {(field) => (
                <div className="space-y-2">
                  <SelectCombobox
                    id="product-discount-type"
                    aria-label="Jenis diskon"
                    aria-describedby="product-discount-type-error"
                    options={discountTypes}
                    value={field.state.value}
                    placeholder="Pilih jenis diskon"
                    onChange={(value) => {
                      field.handleChange(value);
                      form.setFieldValue("discount", "");
                    }}
                    onBlur={field.handleBlur}
                    invalid={!field.state.meta.isValid}
                  />
                  <Errors
                    id="product-discount-type-error"
                    errors={field.state.meta.errors}
                  />
                </div>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.values.discountType}>
              {(discountType) => {
                if (!discountType || discountType === discountTypes[0]) return null;
                return (
                  <form.Field name="discount">
                    {(field) => (
                      <div className="space-y-2">
                        {discountType === "Persentase (%)" ? (
                          <Input
                            id="product-discount"
                            name={field.name}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            max="100"
                            aria-label="Persentase diskon"
                            placeholder="Persentase diskon"
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            onBlur={field.handleBlur}
                            aria-invalid={!field.state.meta.isValid}
                            aria-describedby="discount-error"
                          />
                        ) : (
                          <InputNominal
                            id="product-discount"
                            name={field.name}
                            aria-label="Nominal diskon"
                            placeholder="Nominal diskon"
                            value={field.state.value}
                            onValueChange={field.handleChange}
                            onBlur={field.handleBlur}
                            aria-invalid={!field.state.meta.isValid}
                            aria-describedby="discount-error"
                          />
                        )}
                        <Errors
                          id="discount-error"
                          errors={field.state.meta.errors}
                        />
                      </div>
                    )}
                  </form.Field>
                );
              }}
            </form.Subscribe>
          </fieldset>

          <form.Field name="description">
            {(field) => (
              <div className="space-y-2">
                <label
                  htmlFor="product-description"
                  className="text-sm font-medium"
                >
                  Deskripsi
                </label>
                <Textarea
                  id="product-description"
                  name={field.name}
                  rows={4}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button
                variant="submit"
                loading={isSubmitting}
                className="w-full"
                disabled={
                  uploadStatus.busy ||
                  addCategoryMutation.isPending ||
                  catalog.isPending ||
                  storeOptions.length === 0
                }
              >
                Simpan
              </Button>
            )}
          </form.Subscribe>
        </fieldset>
      </form>
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Periksa data produk</DialogTitle>
            <DialogDescription>
              Perbaiki field berikut sebelum menyimpan.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-[50dvh] space-y-4 overflow-y-auto py-2">
            {submitErrors.map(({ field, messages }) => (
              <li key={field} className="space-y-1">
                <p className="text-sm font-medium">
                  {fieldLabels[field] ?? field}
                </p>
                <p className="text-sm text-muted-foreground">{messages[0]}</p>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
