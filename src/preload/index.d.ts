import type { PlanMeApi } from '../shared/types'

declare global {
  interface Window {
    api: PlanMeApi
  }
}
