import { createFileRoute } from '@tanstack/react-router'
import { StoresPage } from '@/features/stores/stores-page'

export const Route = createFileRoute('/store')({ component: StoresPage })
