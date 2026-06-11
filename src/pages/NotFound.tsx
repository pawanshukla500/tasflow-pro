import { Link, useLocation } from "react-router-dom";
import { Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="text-center max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-muted flex items-center justify-center">
          <span className="text-3xl font-bold text-muted-foreground">404</span>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            <code className="text-xs bg-muted px-2 py-0.5 rounded">{location.pathname}</code> doesn't exist or was moved.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button asChild variant="default">
            <Link to="/"><Home className="w-4 h-4 mr-2" />Go to Dashboard</Link>
          </Button>
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />Go back
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
