'use client'

import { useState } from 'react'

export function useSidebarMenu() {
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  const toggleSidebar = () => {
    if (window.innerWidth < 1024) {
      setIsMobileOpen(prev => !prev)
      return
    }
    setIsDesktopCollapsed(prev => !prev)
  }

  const closeMobileSidebar = () => setIsMobileOpen(false)

  return {
    isDesktopCollapsed,
    isMobileOpen,
    toggleSidebar,
    closeMobileSidebar,
    setIsDesktopCollapsed,
    setIsMobileOpen,
  }
}
