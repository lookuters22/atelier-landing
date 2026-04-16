import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Bell, ChevronRight, ChevronsUpDown, HelpCircle, Search, Settings } from "lucide-react";
import {
  Collapsible,
  AnimatedCollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NavUser } from "./nav-user";
import { NotificationDropdown } from "./NotificationDropdown";

export interface NavSubItem {
  to: string;
  label: string;
}

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  items?: NavSubItem[];
}

interface NotificationProps {
  items: { id: string; title: string; body: string; time: string; href: string }[];
  unreadCount: number;
  markAllRead: () => void;
  isUnread: (id: string) => boolean;
  onOpen: (href: string, id: string) => void;
  inboxHref: string;
}

interface AppSidebarProps {
  nav: NavItem[];
  badgeMap?: Record<string, number>;
  subtitle?: string;
  userName?: string;
  userEmail?: string;
  userInitials?: string;
  extraNavItems?: NavItem[];
  extraNavLabel?: string;
  footerExtra?: React.ReactNode;
  headerExtra?: React.ReactNode;
  settingsPath?: string;
  onHelpClick?: () => void;
  onSearch?: () => void;
  notificationProps?: NotificationProps;
}

export function AppSidebar({
  nav,
  badgeMap = {},
  subtitle = "Studio OS",
  userName = "Elena Duarte",
  userEmail = "elena@atelier.studio",
  userInitials = "ED",
  extraNavItems,
  extraNavLabel,
  footerExtra,
  headerExtra,
  settingsPath = "/settings",
  onHelpClick,
  onSearch,
  notificationProps,
}: AppSidebarProps) {
  const { pathname } = useLocation();
  const { isMobile } = useSidebar();
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setManualOpen({});
  }, [pathname]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="group/brand data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground transition-shadow duration-300 group-hover/brand:shadow-[0_0_14px_rgba(1,105,204,0.25)]">
                    <span className="text-sm font-semibold">A</span>
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">Atelier</span>
                    <span className="truncate text-xs">{subtitle}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="sidebar-dropdown w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-[18px]"
                align="center"
                side="bottom"
                sideOffset={8}
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Studios
                </DropdownMenuLabel>
                <DropdownMenuItem className="gap-2 p-2">
                  <div className="flex size-6 items-center justify-center rounded-sm bg-sidebar-primary text-sidebar-primary-foreground">
                    <span className="text-xs font-semibold">A</span>
                  </div>
                  Atelier Studio
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 p-2">
                  + Add studio
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Compact search input */}
        <div className="px-3 pb-2 group-data-[collapsible=icon]:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search..."
              className="h-8 w-full rounded-md border border-sidebar-border bg-input pl-8 pr-3 text-sm text-foreground placeholder:text-ink-faint focus:border-[#0169cc] focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && onSearch) onSearch();
              }}
            />
          </div>
        </div>

        {headerExtra}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => {
                const isActive = item.end
                  ? pathname === item.to
                  : pathname.startsWith(item.to);
                const badge = badgeMap[item.to];

                if (item.items && item.items.length > 0) {
                  return (
                    <Collapsible
                      key={item.to}
                      asChild
                      open={isActive || !!manualOpen[item.to]}
                      onOpenChange={(open) =>
                        setManualOpen((prev) => ({ ...prev, [item.to]: open }))
                      }
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton isActive={isActive} tooltip={item.label}>
                            <item.icon />
                            <span>{item.label}</span>
                            <ChevronRight className="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        {badge ? (
                          <SidebarMenuBadge>{badge}</SidebarMenuBadge>
                        ) : null}
                        <AnimatedCollapsibleContent>
                          <SidebarMenuSub>
                            {item.items.map((sub) => {
                              const subActive =
                                sub.to === item.to
                                  ? pathname === sub.to
                                  : pathname === sub.to || pathname.startsWith(sub.to + "/");
                              return (
                                <SidebarMenuSubItem key={sub.to}>
                                  <SidebarMenuSubButton asChild isActive={subActive}>
                                    <NavLink to={sub.to} end={sub.to === item.to}>
                                      <span>{sub.label}</span>
                                    </NavLink>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </AnimatedCollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                      <NavLink to={item.to} end={item.end}>
                        <item.icon />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                    {badge ? (
                      <SidebarMenuBadge>{badge}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {extraNavItems && extraNavItems.length > 0 ? (
          <SidebarGroup>
            {extraNavLabel ? <SidebarGroupLabel>{extraNavLabel}</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {extraNavItems.map((item) => {
                  const isActive = pathname.startsWith(item.to);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                        <NavLink to={item.to}>
                          <item.icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith(settingsPath)}
                  tooltip="Settings"
                >
                  <NavLink to={settingsPath}>
                    <Settings />
                    <span>Settings</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {onHelpClick ? (
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Help" onClick={onHelpClick}>
                    <HelpCircle />
                    <span>Help</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
              {notificationProps ? (
                <SidebarMenuItem>
                  <NotificationDropdown
                    items={notificationProps.items}
                    unreadCount={notificationProps.unreadCount}
                    markAllRead={notificationProps.markAllRead}
                    isUnread={notificationProps.isUnread}
                    onOpen={notificationProps.onOpen}
                    inboxHref={notificationProps.inboxHref}
                  />
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {footerExtra}

      <SidebarFooter>
        <NavUser name={userName} email={userEmail} initials={userInitials} />
      </SidebarFooter>

    </Sidebar>
  );
}
