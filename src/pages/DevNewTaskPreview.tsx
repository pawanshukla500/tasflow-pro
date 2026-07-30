/**
 * DEV-only preview of CreateTaskModal layout (no real auth required).
 * Visit http://localhost:8080/__dev__/new-task while `npm run dev` is running.
 */
import { useState } from "react";
import CreateTaskModal from "@/components/CreateTaskModal";
import { Button } from "@/components/ui/button";

const DevNewTaskPreview = () => {
  const [open, setOpen] = useState(true);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-xl font-bold">Create Task modal preview</h1>
        <p className="text-sm text-muted-foreground">
          Layout-only DEV preview. Assignees may be empty without a signed-in session.
        </p>
        <Button onClick={() => setOpen(true)}>Open New Task</Button>
      </div>
      {open && <CreateTaskModal onClose={() => setOpen(false)} />}
    </div>
  );
};

export default DevNewTaskPreview;
