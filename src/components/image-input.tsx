import { useEffect, useRef, useState } from "react";
import { ImageOff, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

export interface UploadStatus {
  busy: boolean;
  error: string;
}

export function ImagePreview({ src, label }: { src: string; label: string }) {
  const [failedSource, setFailedSource] = useState("");

  return (
    <figure className="relative grid h-52 place-items-center bg-muted/45 p-4 sm:h-64">
      {src !== failedSource ? (
        <img
          src={src}
          alt={label}
          className="absolute inset-0 size-full object-contain p-4"
          onError={() => setFailedSource(src)}
        />
      ) : (
        <figcaption className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <ImageOff className="size-5" aria-hidden="true" />
          Pratinjau tidak tersedia
        </figcaption>
      )}
    </figure>
  );
}

export function ImageInput({
  id,
  value,
  onChange,
  onStatusChange,
  onFileChange,
  label = "Foto produk",
  removable = true,
  removeLabel = "Hapus gambar",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onStatusChange: (status: UploadStatus) => void;
  onFileChange?: (file: File | null) => void;
  label?: string;
  removable?: boolean;
  removeLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const operation = useRef(0);
  const [status, setStatus] = useState<UploadStatus>({
    busy: false,
    error: "",
  });
  const [dragging, setDragging] = useState(false);
  useEffect(
    () => () => {
      operation.current += 1;
    },
    [],
  );

  function updateStatus(next: UploadStatus) {
    setStatus(next);
    onStatusChange(next);
  }

  async function selectFile(file: File) {
    const current = ++operation.current;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      updateStatus({
        busy: false,
        error: "Gunakan JPG, PNG, atau WebP maksimal 5 MB.",
      });
      return;
    }
    updateStatus({ busy: true, error: "" });
    try {
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      });
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("image"));
        image.src = source;
      });
      if (operation.current !== current) return;
      onChange(source);
      onFileChange?.(file);
      updateStatus({ busy: false, error: "" });
    } catch {
      if (operation.current === current)
        updateStatus({
          busy: false,
          error: "Gambar gagal dibaca. Pilih file lain.",
        });
    }
  }

  return (
    <div className="min-w-0 w-full space-y-2">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        disabled={status.busy}
        aria-label={`Pilih ${label.toLowerCase()}`}
        aria-describedby={`${id}-help${status.error ? ` ${id}-error` : ""}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void selectFile(file);
        }}
      />
      <span id={`${id}-label`} className="block text-sm font-medium">
        {label}
      </span>
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border transition-colors",
          dragging && "border-primary bg-primary/5",
          !dragging && value && "border-input bg-background",
          !dragging && !value && "border-input bg-muted/20",
        )}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          const disabled = inputRef.current?.matches(":disabled");
          event.dataTransfer.dropEffect = disabled ? "none" : "copy";
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
          )
            return;
          setDragging(false);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragging(false);
          if (inputRef.current?.matches(":disabled")) return;
          const { files } = event.dataTransfer;
          if (files.length > 1) {
            updateStatus({ busy: false, error: "Pilih satu gambar." });
            return;
          }
          if (files[0]) void selectFile(files[0]);
        }}
      >
        {value && <ImagePreview key={value} src={value} label={label} />}
        <label
          id={`${id}-action`}
          htmlFor={id}
          role="button"
          tabIndex={status.busy ? -1 : 0}
          aria-disabled={status.busy}
          aria-labelledby={`${id}-label ${id}-action`}
          aria-describedby={`${id}-help${status.error ? ` ${id}-error` : ""}`}
          className={cn(
            "flex cursor-pointer text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-disabled:cursor-wait",
            value ? "absolute inset-0 items-end justify-center p-3 hover:bg-foreground/5" : "min-h-24 items-center gap-3 py-4 pl-4 pr-12 text-left hover:bg-muted/50",
          )}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            if (!status.busy) inputRef.current?.click();
          }}
        >
          {value && (
            <span className="px-2.5 py-1 text-foreground ">
              Klik untuk mengganti gambar
            </span>
          )}
          {!value && (
            <>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-primary">
                <ImagePlus className="size-5" aria-hidden="true" />
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className="font-medium">{dragging ? "Lepas untuk memilih gambar" : "Pilih atau seret gambar"}</span>
                <span id={`${id}-help`} className="text-xs text-muted-foreground">
                  JPG, PNG, atau WebP. Maksimal 5 MB.
                </span>
              </span>
            </>
          )}
        </label>
        {((value && removable) || status.error) && (
          <Button
            type="button"
            size="icon-lg"
            variant="outline"
            className="absolute right-2 top-2 z-10 text-destructive"
            aria-label={status.error ? "Abaikan pilihan gambar" : removeLabel}
            title={status.error ? "Abaikan pilihan gambar" : removeLabel}
            disabled={status.busy}
            onClick={() => {
              if (!status.error) {
                onChange("");
                onFileChange?.(null);
              }
              updateStatus({ busy: false, error: "" });
            }}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        )}
      </div>
      {value && (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          JPG, PNG, atau WebP. Maksimal 5 MB.
        </p>
      )}
      {status.busy && (
        <p
          role="status"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          Memproses gambar...
        </p>
      )}
      {status.error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {status.error}
        </p>
      )}
    </div>
  );
}
