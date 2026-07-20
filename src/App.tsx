import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AppLayout from "./components/AppLayout";
import { AppLoadingScreen } from "./components/AppLoadingScreen";

// Eager: login shell (first paint for signed-out users)
import Login from "./pages/Login";

// Route-level code splitting — pages load only when navigated to
const Dashboard = lazy(() => import("./pages/Dashboard"));
const MyTasks = lazy(() => import("./pages/MyTasks"));
const Board = lazy(() => import("./pages/Board"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const PerformancePage = lazy(() => import("./pages/PerformancePage"));
const TeamPage = lazy(() => import("./pages/TeamPage"));
const DepartmentsPage = lazy(() => import("./pages/DepartmentsPage"));
const WorkflowsPage = lazy(() => import("./pages/WorkflowsPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const InboxPage = lazy(() => import("./pages/InboxPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const NotesPage = lazy(() => import("./pages/NotesPage"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Notifications are not needed for first paint — load after shell
const ActivityNotifications = lazy(() => import("./components/ActivityNotifications"));
const ChatNotifications = lazy(() => import("./components/ChatNotifications"));

const queryClient = new QueryClient();

function RouteFallback() {
  return <AppLoadingScreen message="Loading…" />;
}

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

const AppRoutes = () => (
  <>
    <Suspense fallback={null}>
      <ChatNotifications />
      <ActivityNotifications />
    </Suspense>
    <Suspense fallback={<RouteFallback />}>
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
    </Suspense>
  </>
);

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
