import { useState } from 'react'
import { useTheme } from '@/context/ThemeContext.jsx'
import { useInstallPrompt } from '@/hooks/useInstallPrompt.js'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Sun, Moon, Monitor, Search,
  LayoutDashboard, CalendarRange, Settings, MoreVertical, Download, Share,
} from 'lucide-react'

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { key: 'calendar', label: 'Calendar', Icon: CalendarRange },
  { key: 'settings', label: 'Settings', Icon: Settings },
]

export default function Header({ screen, onNavigate, onSearch }) {
  const { theme, setTheme } = useTheme()
  const { canInstall, isIOS, isStandalone, install } = useInstallPrompt()
  const [iosOpen, setIosOpen] = useState(false)

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  const showInstall = !isStandalone && (canInstall || isIOS)

  const InstallButton = ({ className = '' }) => {
    if (!showInstall) return null
    if (isIOS && !canInstall) {
      return (
        <Popover open={iosOpen} onOpenChange={setIosOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={`gap-2 ${className}`}>
              <Share className="h-4 w-4" />
              <span className="hidden sm:inline">Install App</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 text-sm" align="end">
            <p className="font-medium mb-1">Install on iPhone / iPad</p>
            <p className="text-muted-foreground">
              Tap <strong>Share</strong> <Share className="inline h-3.5 w-3.5 mx-0.5" /> in Safari, then choose{' '}
              <strong>"Add to Home Screen"</strong>.
            </p>
          </PopoverContent>
        </Popover>
      )
    }
    return (
      <Button variant="outline" size="sm" className={`gap-2 ${className}`} onClick={install}>
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Install App</span>
      </Button>
    )
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-3 px-4 sm:px-6">

        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xl">🏏</span>
          <span className="font-semibold text-sm hidden sm:block">Six &amp; Out</span>
        </div>

        {/* Desktop nav */}
        <Separator orientation="vertical" className="h-5 mx-1 hidden sm:block" />
        <nav className="hidden sm:flex items-center gap-1">
          {NAV_ITEMS.map(({ key, label, Icon }) => (
            <Button
              key={key}
              variant={screen === key ? 'secondary' : 'ghost'}
              size="sm"
              className="gap-2"
              onClick={() => onNavigate(key)}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Availability search */}
          <Button variant="outline" size="sm" className="gap-2" onClick={onSearch}>
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Check Availability</span>
          </Button>

          {/* Install button — desktop */}
          <div className="hidden sm:block">
            <InstallButton />
          </div>

          {/* Theme toggle — desktop */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 hidden sm:flex">
                <ThemeIcon className="h-4 w-4" />
                <span className="sr-only">Toggle theme</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme('light')}>
                <Sun className="mr-2 h-4 w-4" /> Light
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')}>
                <Moon className="mr-2 h-4 w-4" /> Dark
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('system')}>
                <Monitor className="mr-2 h-4 w-4" /> System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile overflow menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 sm:hidden">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {NAV_ITEMS.map(({ key, label, Icon }) => (
                <DropdownMenuItem key={key} onClick={() => onNavigate(key)}>
                  <Icon className="mr-2 h-4 w-4" /> {label}
                </DropdownMenuItem>
              ))}
              {showInstall && <DropdownMenuSeparator />}
              {showInstall && canInstall && (
                <DropdownMenuItem onClick={install}>
                  <Download className="mr-2 h-4 w-4" /> Install App
                </DropdownMenuItem>
              )}
              {showInstall && isIOS && !canInstall && (
                <DropdownMenuItem onClick={() => setIosOpen(true)}>
                  <Share className="mr-2 h-4 w-4" /> Install App
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTheme('light')}>
                <Sun className="mr-2 h-4 w-4" /> Light mode
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')}>
                <Moon className="mr-2 h-4 w-4" /> Dark mode
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('system')}>
                <Monitor className="mr-2 h-4 w-4" /> System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
