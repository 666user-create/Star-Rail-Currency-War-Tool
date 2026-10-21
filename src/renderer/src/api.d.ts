import type { PetApi } from '@shared/types'

declare global {
  interface Window {
    api: PetApi
  }
}

export {}
