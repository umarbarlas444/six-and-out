import { useApp } from '@/context/AppContext.jsx'
import { useTheme } from '@/context/ThemeContext.jsx'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Sun, Moon, Monitor, RefreshCw, Search,
  LayoutDashboard, Tags, MoreVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Header({ screen, onNavigate, onSearch }) {
  const { syncStatus, pendingCount, sync } = useApp()
  const { theme, setTheme } = useTheme()

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  const syncDot = {
    synced:  'bg-emerald-500',
    pending: 'bg-amber-500',
    syncing: 'bg-blue-500 animate-pulse',
    error:   'bg-destructive',
    offline: 'bg-muted-foreground',
  }[syncStatus] ?? 'bg-emerald-500'

  const syncLabel = {
    synced:  'All synced',
    pending: `${pendingCount} pending`,
    syncing: 'Syncing…',
    error:   'Sync failed',
    offline: 'Offline',
  }[syncStatus] ?? 'All synced'

  return (
    <TooltipProvider>
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
            <Button
              variant={screen === 'home' ? 'secondary' : 'ghost'}
              size="sm"
              className="gap-2"
              onClick={() => onNavigate('home')}
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Button>
            <Button
              variant={screen === 'settings' ? 'secondary' : 'ghost'}
              size="sm"
              className="gap-2"
              onClick={() => onNavigate('settings')}
            >
              <Tags className="h-4 w-4" />
              Statuses
            </Button>
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Availability search */}
            <Button variant="outline" size="sm" className="gap-2" onClick={onSearch}>
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Check Availability</span>
            </Button>

            {/* Sync indicator — desktop */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hidden sm:flex"
                  onClick={sync}
                >
                  <span className={cn('h-2 w-2 rounded-full', syncDot)} />
                  <RefreshCw className={cn('h-3.5 w-3.5 ml-1', syncStatus === 'syncing' && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{syncLabel}</TooltipContent>
            </Tooltip>

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
                <DropdownMenuItem onClick={() => onNavigate('home')}>
                  <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigate('settings')}>
                  <Tags className="mr-2 h-4 w-4" /> Statuses
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={sync}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Sync now
                </DropdownMenuItem>
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
    </TooltipProvider>
  )
}
