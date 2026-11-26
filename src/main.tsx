import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import { refreshAuthSession } from "./lib/api";
import { Toaster } from "sonner";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";

void refreshAuthSession(true)?.catch(() => undefined);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster
        className="kasir-toaster"
        position="top-center"
        richColors
        icons={{
          success: <CircleCheck size={18} className="fill-success-indicator text-status-icon-foreground" aria-hidden="true" />,
          warning: <TriangleAlert size={18} className="fill-warning-indicator text-status-icon-foreground" aria-hidden="true" />,
          error: <CircleAlert size={18} className="fill-destructive-indicator text-status-icon-foreground" aria-hidden="true" />,
        }}
        toastOptions={{ style: { fontFamily: "var(--sans)" } }}
        expand={true}
      />
    </QueryClientProvider>
  </StrictMode>,
);
