import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Login from "./pages/Login";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import MyTasks from "./pages/MyTasks";
import Board from "./pages/Board";
import CalendarPage from "./pages/CalendarPage";
import GoalsPage from "./pages/GoalsPage";
import PerformancePage from "./pages/PerformancePage";
import TeamPage from "./pages/TeamPage";
import DepartmentsPage from "./pages/DepartmentsPage";
import WorkflowsPage from "./pages/WorkflowsPage";
import ReportsPage from "./pages/ReportsPage";
import InboxPage from "./pages/InboxPage";
import SettingsPage from "./pages/SettingsPage";
import NotesPage from "./pages/NotesPage";
import Unsubscribe from "./pages/Unsubscribe";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import ActivityNotifications from "./components/ActivityNotifications";
import ChatNotifications from "./components/ChatNotifications";
import { AppLoadingScreen } from "./components/AppLoadingScreen";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AppLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AppLoadingScreen message="Preparing sign in…" />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RoleRoute({ children, roles }: { children: React.ReactNode; roles: ("admin" | "manager")[] }) {
  const { user, loading, hasFullAccess, isManagerOrAbove } = useAuth();
  if (loading) return <AppLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  const allowed =
    (roles.includes("admin") && hasFullAccess) ||
    (roles.includes("manager") && isManagerOrAbove);
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (<>
  <ChatNotifications />
  <ActivityNotifications />
  <Routes>
    <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/unsubscribe" element={<Unsubscribe />} />
    <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
      <Route path="/" element={<Dashboard />} />
      <Route path="/my-tasks" element={<MyTasks />} />
      <Route path="/board" element={<Board />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/goals" element={<GoalsPage />} />
      <Route path="/performance" element={<PerformancePage />} />
      <Route path="/team" element={<RoleRoute roles={["manager"]}><TeamPage /></RoleRoute>} />
      <Route path="/departments" element={<RoleRoute roles={["admin"]}><DepartmentsPage /></RoleRoute>} />
      {/* Workflows is open to all users — RLS scopes employees to workflows they raised or are assigned a stage in */}
      <Route path="/workflows" element={<WorkflowsPage />} />
      <Route path="/reports" element={<RoleRoute roles={["manager"]}><ReportsPage /></RoleRoute>} />
      <Route path="/inbox" element={<InboxPage />} />
      <Route path="/notes" element={<NotesPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/list" element={<Navigate to="/my-tasks" replace />} />
      <Route path="/users" element={<RoleRoute roles={["manager"]}><TeamPage /></RoleRoute>} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
</>);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
