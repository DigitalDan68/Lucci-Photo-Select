import { useEffect, useState } from 'react'
export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('lpv-theme')
    return saved === 'light' || saved === 'dark' ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('lpv-theme', theme)
  }, [theme])
  useEffect(() => window.photoAPI.onMenuAction(action => {
    if (action === 'toggle-theme') setTheme(current => current === 'dark' ? 'light' : 'dark')
  }), [])
  return null
}
