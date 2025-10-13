import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Users, List, Search } from "lucide-react";
import { MyCompanyProfile } from "@/components/MyCompanyProfile";
import { Separator } from "@/components/ui/separator";
import { useOutreachCount } from "@/hooks/useOutreachCount";
import { OutreachWidget } from "@/components/OutreachWidget";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { count: outreachCount, refetch: refetchOutreachCount } = useOutreachCount();

  const navItems = [
    { to: "/customers", label: "Existing Customers", icon: Users },
    { to: "/shortlist", label: "My Shortlist", icon: List },
    { to: "/analyze", label: "Analyze Companies", icon: Search },
  ];

  return (
    <div className="min-h-screen bg-background flex w-full">
      {/* Left Sidebar */}
      <aside className="w-[280px] border-r border-border bg-sidebar sticky top-0 h-screen overflow-y-auto flex flex-col">
        <div className="p-4 space-y-4 flex-1">
          {/* My Company Section */}
          <MyCompanyProfile />
          
          <Separator />
          
          {/* Navigation */}
          <nav className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-14 border-b border-border bg-card px-6 flex items-center justify-between sticky top-0 z-10">
          <h1 className="text-lg font-semibold text-foreground">
            Firmable Demo – Kokum
          </h1>
          
          <OutreachWidget count={outreachCount} onCountChange={refetchOutreachCount} />
        </header>

        {/* Page Content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
