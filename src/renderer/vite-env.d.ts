/// <reference types="vite/client" />

interface Window {
  wangzi?: {
    platform: string
    saveText: (defaultName: string, text: string) => Promise<string | null>
    openText: () => Promise<string | null>
  }
}
