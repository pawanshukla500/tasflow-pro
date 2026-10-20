/**
 * DEV-only preview of the task discussion panel (no auth or database).
 * Visit http://localhost:8080/__dev__/task-discussion while `npm run dev` is running.
 */
import { useState } from "react";
import { TaskDiscussionView } from "@/components/TaskDiscussion";
import type { TaskDiscussionController } from "@/hooks/useTaskDiscussion";
import type { DiscussionComment } from "@/lib/taskDiscussion";

const me = "11111111-1111-4111-8111-111111111111";
const ada = "22222222-2222-4222-8222-222222222222";

const seed: DiscussionComment[] = [
  {
    id: "c1",
    taskId: "preview",
    userId: ada,
    body: `Can you confirm the brief @[Preview User](${me})?`,
    commentType: "message",
    parentId: null,
    editedAt: null,
    createdAt: "2026-10-20T09:15:00Z",
    authorName: "Ada Lovelace",
    authorAvatar: null,
    attachments: [
      {
        id: "file-1",
        fileName: "brief.pdf",
        fileUrl: "https://example.test/brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 24000,
      },
    ],
  },
  {
    id: "c2",
    taskId: "preview",
    userId: me,
    body: "Uploading the revision today.",
    commentType: "note",
    parentId: "c1",
    editedAt: null,
    createdAt: "2026-10-20T09:40:00Z",
    authorName: "Preview User",
    authorAvatar: null,
    attachments: [],
  },
  {
    id: "c3",
    taskId: "preview",
    userId: ada,
    body: "Approved — marked complete.",
    commentType: "review_approve",
    parentId: null,
    editedAt: null,
    createdAt: "2026-10-20T09:45:00Z",
    authorName: "Ada Lovelace",
    authorAvatar: null,
    attachments: [],
  },
];

const DevTaskDiscussionPreview = () => {
  const [comments, setComments] = useState(seed);
  const [sending, setSending] = useState(false);

  const controller: TaskDiscussionController = {
    comments,
    participants: [{ id: ada, name: "Ada Lovelace", avatarUrl: null }],
    loading: false,
    error: null,
    realtime: true,
    sending,
    mode: "full",
    reload: () => setComments(seed),
    send: async (input) => {
      setSending(true);
      await new Promise((resolve) => setTimeout(resolve, 150));
      setComments((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          taskId: "preview",
          userId: me,
          body: input.body.trim(),
          commentType: "message",
          parentId: input.parentId,
          editedAt: null,
          createdAt: new Date().toISOString(),
          authorName: "Preview User",
          authorAvatar: null,
          attachments: input.files.map((file) => ({
            id: crypto.randomUUID(),
            fileName: file.name,
            fileUrl: URL.createObjectURL(file),
            mimeType: file.type || null,
            sizeBytes: file.size,
          })),
        },
      ]);
      setSending(false);
    },
    edit: async (id, body) => {
      setComments((prev) => prev.map((comment) => (
        comment.id === id ? { ...comment, body: body.trim(), editedAt: new Date().toISOString() } : comment
      )));
    },
    remove: async (id) => {
      setComments((prev) => prev.filter((comment) => comment.id !== id && comment.parentId !== id));
    },
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-6xl flex-col overflow-hidden rounded-lg border bg-card shadow-lg lg:min-h-[40rem] lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(18.5rem,24rem)]">
        <div className="space-y-3 border-b p-4 lg:border-b-0 lg:border-r">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Task</p>
          <h1 className="text-xl font-semibold text-foreground">Refresh the launch brief</h1>
          <p className="text-sm text-muted-foreground">
            Layout preview of the discussion that sits beside a task. Messages here stay in the browser.
          </p>
        </div>
        <div className="min-h-[32rem] lg:min-h-0">
          <TaskDiscussionView controller={controller} currentUserId={me} />
        </div>
      </div>
    </div>
  );
};

export default DevTaskDiscussionPreview;
