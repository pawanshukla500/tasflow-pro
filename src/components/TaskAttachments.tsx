import { useEffect, useRef, useState } from "react";
import { Paperclip, X, FileIcon, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface AttachmentRow {
  id: string;
  file_name: string;
  file_url: string;
  size_bytes: number | null;
  uploaded_by: string | null;
}

interface Props {
  taskId: string;
}

const formatSize = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const TaskAttachments = ({ taskId }: Props) => {
  const { user } = useAuth();
  const [items, setItems] = useState<AttachmentRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase
      .from("task_attachments")
      .select("id, file_name, file_url, size_bytes, uploaded_by")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });
    setItems((data as AttachmentRow[]) || []);
  };

  useEffect(() => {
    if (taskId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("folder", "task-attachments");
        const { data, error } = await supabase.functions.invoke("firebase-upload", {
          body: form,
        });
        if (error) throw error;
        const { error: insErr } = await supabase.from("task_attachments").insert({
          task_id: taskId,
          uploaded_by: user?.id,
          file_name: file.name,
          file_url: (data as any).url,
          file_path: (data as any).path,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
        if (insErr) throw insErr;
      }
      toast.success("Attachment uploaded");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("task_attachments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Attachments</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5 mr-1.5" />}
          {uploading ? "Uploading…" : "Add files"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No attachments yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm"
            >
              <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <a
                href={a.file_url}
                target="_blank"
                rel="noreferrer"
                className="flex-1 truncate hover:underline"
              >
                {a.file_name}
              </a>
              <span className="text-xs text-muted-foreground">{formatSize(a.size_bytes)}</span>
              <a href={a.file_url} target="_blank" rel="noreferrer" aria-label="Download">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </a>
              {(a.uploaded_by === user?.id) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleDelete(a.id)}
                  aria-label="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TaskAttachments;
