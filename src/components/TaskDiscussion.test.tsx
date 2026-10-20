import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TaskDiscussionView } from "@/components/TaskDiscussion";
import type { TaskDiscussionController } from "@/hooks/useTaskDiscussion";
import type { DiscussionComment, DiscussionParticipant } from "@/lib/taskDiscussion";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const me = "11111111-1111-4111-8111-111111111111";
const ada = "22222222-2222-4222-8222-222222222222";

const people: DiscussionParticipant[] = [
  { id: ada, name: "Ada Lovelace", avatarUrl: null },
];

function message(partial: Partial<DiscussionComment> = {}): DiscussionComment {
  return {
    id: "m1",
    taskId: "task-1",
    userId: ada,
    body: `Please review @[Ada Lovelace](${ada})`,
    commentType: "message",
    parentId: null,
    editedAt: null,
    createdAt: "2026-10-20T09:30:00Z",
    authorName: "Ada Lovelace",
    authorAvatar: null,
    attachments: [],
    ...partial,
  };
}

function Harness({
  initial = [message()],
  onSend,
}: {
  initial?: DiscussionComment[];
  onSend?: TaskDiscussionController["send"];
}) {
  const [comments, setComments] = useState(initial);
  const controller: TaskDiscussionController = {
    comments,
    participants: people,
    loading: false,
    error: null,
    realtime: true,
    sending: false,
    mode: "full",
    reload: () => {},
    send: onSend || (async (input) => {
      setComments((prev) => [
        ...prev,
        message({
          id: "new",
          userId: me,
          authorName: "Pawan",
          body: input.body,
          parentId: input.parentId,
          createdAt: "2026-10-20T10:00:00Z",
          attachments: input.files.map((file) => ({
            id: file.name,
            fileName: file.name,
            fileUrl: "https://example.test/file",
            mimeType: file.type,
            sizeBytes: file.size,
          })),
        }),
      ]);
    }),
    edit: async (id, body) => {
      setComments((prev) => prev.map((comment) => (
        comment.id === id ? { ...comment, body, editedAt: "2026-10-20T10:05:00Z" } : comment
      )));
    },
    remove: async (id) => {
      setComments((prev) => prev.filter((comment) => comment.id !== id && comment.parentId !== id));
    },
  };
  return <TaskDiscussionView controller={controller} currentUserId={me} />;
}

describe("TaskDiscussion", () => {
  it("shows history, sender, mention, and a live indicator", () => {
    render(<Harness />);
    expect(screen.getByRole("heading", { name: "Discussion" })).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("@Ada Lovelace")).toBeInTheDocument();
  });

  it("sends a reply and inserts an @mention from the picker", async () => {
    const sent: { body: string; parentId: string | null }[] = [];
    render(
      <Harness
        onSend={async (input) => {
          sent.push({ body: input.body, parentId: input.parentId });
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByText("Replying to Ada Lovelace")).toBeInTheDocument();

    const field = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(field, { target: { value: "Thanks @Ada", selectionStart: "Thanks @Ada".length } });
    expect(screen.getByRole("option", { name: "Ada Lovelace" })).toBeInTheDocument();
    fireEvent.keyDown(field, { key: "Enter" });
    expect((field as HTMLTextAreaElement).value).toContain(`@[Ada Lovelace](${ada})`);

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(sent).toHaveLength(1);
    expect(sent[0].parentId).toBe("m1");
    expect(sent[0].body).toContain(ada);
  });

  it("clears an in-progress edit before starting a reply", () => {
    const sent: { body: string; parentId: string | null }[] = [];
    render(
      <Harness
        initial={[
          message(),
          message({ id: "mine", userId: me, authorName: "Pawan", body: "My draft note" }),
        ]}
        onSend={async (input) => {
          sent.push({ body: input.body, parentId: input.parentId });
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "Message" });
    expect((field as HTMLTextAreaElement).value).toBe("My draft note");
    expect(screen.getByText("Editing your message")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[0]);
    expect(screen.getByText("Replying to Ada Lovelace")).toBeInTheDocument();
    expect((field as HTMLTextAreaElement).value).toBe("");

    fireEvent.change(field, { target: { value: "A real reply", selectionStart: "A real reply".length } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(sent).toEqual([{ body: "A real reply", parentId: "m1" }]);
  });

  it("rejects an unsupported attachment before send", () => {
    render(<Harness />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["hi"], "virus.exe", { type: "application/octet-stream" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByRole("alert")).toHaveTextContent("isn't a supported file type");
  });

  it("keeps an existing note visible beside chat messages", () => {
    render(
      <Harness
        initial={[
          message({ id: "note", commentType: "note", body: "Progress from coding sync", userId: me, authorName: "Pawan" }),
          message({ id: "audit", commentType: "review_approve", body: "Looks good", authorName: "Ada Lovelace" }),
        ]}
      />,
    );
    expect(screen.getByText("Progress from coding sync")).toBeInTheDocument();
    expect(screen.getByText("Note")).toBeInTheDocument();
    expect(screen.getByText(/approved this task/)).toBeInTheDocument();
  });
});
