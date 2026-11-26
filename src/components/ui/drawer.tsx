import * as React from "react"
import { cn } from "cn"
import { Drawer as DrawerPrimitive } from "vaul"
import { OverlayPortalContext, useOverlayPortalContainer } from './overlay-portal-context'

type DrawerProps = React.ComponentProps<typeof DrawerPrimitive.Root>
const DrawerViewportContext = React.createContext(false)

function DrawerRoot({ nestedRoot = false, direction = "bottom", repositionInputs = true, ...props }: DrawerProps & {
  nestedRoot?: boolean
}) {
  const trackViewport = direction === "bottom" && repositionInputs && !props.snapPoints?.length && !props.fixed
  const Root = nestedRoot ? DrawerPrimitive.NestedRoot : DrawerPrimitive.Root
  return (
    <DrawerViewportContext.Provider value={trackViewport}>
      <Root data-slot="drawer" direction={direction} repositionInputs={repositionInputs && !trackViewport} {...props} />
    </DrawerViewportContext.Provider>
  )
}

function Drawer(props: DrawerProps) {
  return <DrawerRoot {...props} />
}

function NestedDrawer(props: DrawerProps) {
  return <DrawerRoot {...props} nestedRoot />
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn("modal-backdrop", className)}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  ref: forwardedRef,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  const { container, ref } = useOverlayPortalContainer(forwardedRef)
  const trackViewport = React.useContext(DrawerViewportContext)

  React.useEffect(() => {
    const viewport = window.visualViewport
    if (!trackViewport || !container || !viewport) return

    let frame = 0
    function updateViewport() {
      if (!container || !viewport) return

      // A keyboard can shrink and pan the visual viewport while the drawer stays fixed to the layout viewport.
      const layoutHeight = document.documentElement.clientHeight
      const availableHeight = viewport.scale === 1 ? viewport.height : layoutHeight
      const bottom = viewport.scale === 1 ? Math.max(0, layoutHeight - viewport.offsetTop - availableHeight) : 0
      container.style.setProperty("--drawer-viewport-bottom", `${bottom}px`)
      container.style.setProperty("--drawer-viewport-height", `${availableHeight}px`)

      const field = document.activeElement
      if (availableHeight >= layoutHeight || !field || !container.contains(field)) return
      const body = field.closest(".modal-body")
      if (!body || !container.contains(body)) return

      const fieldBounds = field.getBoundingClientRect()
      const bodyBounds = body.getBoundingClientRect()
      if (fieldBounds.bottom > bodyBounds.bottom) body.scrollTop += fieldBounds.bottom - bodyBounds.bottom
      else if (fieldBounds.top < bodyBounds.top) body.scrollTop -= bodyBounds.top - fieldBounds.top
    }

    function scheduleUpdate() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(updateViewport)
    }

    updateViewport()
    viewport.addEventListener("resize", scheduleUpdate)
    viewport.addEventListener("scroll", scheduleUpdate)
    container.addEventListener("focusin", scheduleUpdate)
    return () => {
      window.cancelAnimationFrame(frame)
      viewport.removeEventListener("resize", scheduleUpdate)
      viewport.removeEventListener("scroll", scheduleUpdate)
      container.removeEventListener("focusin", scheduleUpdate)
      container.style.removeProperty("--drawer-viewport-bottom")
      container.style.removeProperty("--drawer-viewport-height")
    }
  }, [container, trackViewport])

  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        data-track-viewport={trackViewport || undefined}
        className={cn(
          "modal-surface product-drawer group/drawer-content fixed z-50 h-auto pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[85dvh] data-[vaul-drawer-direction=bottom]:rounded-t-2xl data-[vaul-drawer-direction=bottom]:border-t data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:rounded-r-2xl data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:rounded-l-2xl data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[85dvh] data-[vaul-drawer-direction=top]:rounded-b-2xl data-[vaul-drawer-direction=top]:border-b data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:sm:max-w-sm",
          className
        )}
        {...props}
        ref={ref}
      >
        <OverlayPortalContext.Provider value={container}>
          <div className="mx-auto mt-3 hidden h-1 w-10 shrink-0 rounded-full bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
          {children}
        </OverlayPortalContext.Provider>
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("modal-header text-center", className)}
      {...props}
    />
  )
}

function DrawerBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-body"
      className={cn("modal-body", className)}
      {...props}
    />
  )
}

function DrawerFooter({ className, actions = false, ...props }: React.ComponentProps<"div"> & {
  actions?: boolean
}) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("modal-footer", actions ? "modal-actions" : "flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("modal-title", className)}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("modal-description", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  NestedDrawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
