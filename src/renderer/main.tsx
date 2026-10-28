import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { theme } from '../core/brand.ts'
import { App } from './App.tsx'
import './styles.css'

const rootStyle = document.documentElement.style
rootStyle.setProperty('--bg', theme.background)
rootStyle.setProperty('--panel', theme.panel)
rootStyle.setProperty('--gold', theme.gold)
rootStyle.setProperty('--ink', theme.ink)
rootStyle.setProperty('--muted', theme.muted)
rootStyle.setProperty('--line', theme.line)

const root = document.getElementById('root')
if (!root) throw new Error('找不到根节点')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
