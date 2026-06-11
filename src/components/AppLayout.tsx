import { useState, useEffect, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import AppSidebar from "@/components/AppSidebar";
import CreateTaskModal from "@/components/CreateTaskModal";
import SearchOverlay from "@/components/SearchOverlay";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const AppLayout = () => {
  const [showNewTask, setShowNewTask] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setShowSearch(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        <AppSidebar
          onNewTask={() => setShowNewTask(true)}
          onSearch={() => setShowSearch(true)}
        />
      </div>

      {/* Mobile sidebar drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="p-0 w-72 max-w-[85vw] border-r">
          <AppSidebar
            onNewTask={() => { setShowNewTask(true); setMobileNavOpen(false); }}
            onSearch={() => { setShowSearch(true); setMobileNavOpen(false); }}
            onNavigate={() => setMobileNavOpen(false)}
            mobile
          />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b bg-card/80 backdrop-blur-sm shrink-0">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <img src="/youthnic-logo.png" alt="" className="w-7 h-7 object-contain" />
            <span className="font-semibold text-sm truncate">TaskFlow Pro</span>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowSearch(true)}>
            Search
          </Button>
        </header>

        {/* key on pathname so the enter animation replays on every navigation */}
        <main key={location.pathname} className="flex-1 overflow-y-auto page-enter">
          <Outlet />
        </main>
      </div>

      {showNewTask && <CreateTaskModal onClose={() => setShowNewTask(false)} />}
      {showSearch && (
        <SearchOverlay
          onClose={() => setShowSearch(false)}
          onSelectTask={() => setShowSearch(false)}
        />
      )}
    </div>
  );
};

export default AppLayout;
