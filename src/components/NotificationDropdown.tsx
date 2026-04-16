import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time: string;
  href: string;
}

interface NotificationDropdownProps {
  items: NotificationItem[];
  unreadCount: number;
  markAllRead: () => void;
  isUnread: (id: string) => boolean;
  onOpen: (href: string, id: string) => void;
  inboxHref: string;
}

export function NotificationDropdown({
  items,
  unreadCount,
  markAllRead,
  isUnread,
  onOpen,
  inboxHref,
}: NotificationDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton tooltip="Notifications" className="relative">
          <Bell />
          <span>Notifications</span>
          {unreadCount > 0 ? (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0169cc] px-1.5 text-[10px] font-semibold text-white">
              {unreadCount}
            </span>
          ) : null}
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={8}
        className="sidebar-dropdown w-[22rem] rounded-[18px] p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-2.5">
          <DropdownMenuLabel className="p-0 text-[13px] font-semibold text-ink">
            Notifications
          </DropdownMenuLabel>
          <button
            type="button"
            className="text-[12px] font-semibold text-link hover:text-link-hover"
            onClick={markAllRead}
          >
            Mark all read
          </button>
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-80 overflow-y-auto">
          {items.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className={
                "flex cursor-pointer flex-col gap-0.5 rounded-none px-4 py-3 " +
                (isUnread(n.id) ? "bg-link/5" : "")
              }
              onClick={() => onOpen(n.href, n.id)}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink">{n.title}</span>
                {isUnread(n.id) ? (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-link" />
                ) : null}
              </div>
              <span className="text-[12px] text-ink-muted">{n.body}</span>
              <span className="text-[11px] text-ink-faint">{n.time}</span>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <DropdownMenuItem
          className="justify-center rounded-none px-4 py-2.5"
          onClick={() => onOpen(inboxHref, "")}
        >
          <span className="text-[12px] font-semibold text-link">Open inbox</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
