import { describe, expect, it } from "vitest";
import {
  applyMention,
  canModifyComment,
  filterParticipants,
  mentionIdsIn,
  mentionQueryAt,
  removeComment,
  segmentBody,
  threadComments,
  upsertAttachment,
  upsertComment,
  safeHttpUrl,
  validateDiscussionFile,
  type DiscussionComment,
  type DiscussionParticipant,
} from "@/lib/taskDiscussion";

const ada = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ben = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function comment(partial: Partial<DiscussionComment> & Pick<DiscussionComment, "id" | "createdAt">): DiscussionComment {
  return {
    taskId: "task",
    userId: ada,
    body: "hello",
    commentType: "message",
    parentId: null,
    editedAt: null,
    authorName: "Ada",
    authorAvatar: null,
    attachments: [],
    ...partial,
  };
}

describe("task discussion mentions", () => {
  it("reads unique mention ids and ignores plain @names", () => {
    const body = `Hi @[Ada Lovelace](${ada}) and @[Ada Lovelace](${ada.toUpperCase()}) plus @ben`;
    expect(mentionIdsIn(body)).toEqual([ada]);
  });

  it("splits a message into text and mention chips", () => {
    const parts = segmentBody(`Ping @[Ben](${ben}) today`);
    expect(parts).toEqual([
      { type: "text", text: "Ping " },
      { type: "mention", name: "Ben", userId: ben },
      { type: "text", text: " today" },
    ]);
  });

  it("detects the mention being typed at the cursor", () => {
    const text = "Hello @Ad";
    expect(mentionQueryAt(text, text.length)).toEqual({ start: 6, query: "Ad" });
    expect(mentionQueryAt("email me@work.com", 16)).toBeNull();
  });

  it("replaces the active @query with a stable token", () => {
    const text = "Hello @Ad";
    const next = applyMention(text, text.length, { id: ada, name: "Ada [Ops]" });
    expect(next.text).toBe(`Hello @[Ada Ops](${ada}) `);
    expect(next.cursor).toBe(next.text.length);
  });

  it("filters teammates by name", () => {
    const people: DiscussionParticipant[] = [
      { id: ada, name: "Ada", avatarUrl: null },
      { id: ben, name: "Ben", avatarUrl: null },
    ];
    expect(filterParticipants(people, "be").map((person) => person.id)).toEqual([ben]);
  });
});

describe("task discussion thread", () => {
  it("nests a single level of replies and keeps activity in order", () => {
    const items = threadComments([
      comment({ id: "2", createdAt: "2026-10-20T10:01:00Z", parentId: "1", body: "reply" }),
      comment({ id: "1", createdAt: "2026-10-20T10:00:00Z", body: "root" }),
      comment({ id: "3", createdAt: "2026-10-20T10:02:00Z", commentType: "review_approve", body: "Approved" }),
      comment({ id: "4", createdAt: "2026-10-20T10:03:00Z", parentId: "2", body: "too deep" }),
    ]);
    expect(items.map((item) => item.comment.id)).toEqual(["1", "3", "4"]);
    expect(items[0].replies.map((reply) => reply.id)).toEqual(["2"]);
  });

  it("upserts without dropping attachments and removes a thread", () => {
    const original = comment({
      id: "1",
      createdAt: "2026-10-20T10:00:00Z",
      attachments: [{ id: "file", fileName: "a.pdf", fileUrl: "https://example.test/a.pdf", mimeType: "application/pdf", sizeBytes: 10 }],
    });
    const updated = upsertComment([original], comment({ id: "1", createdAt: original.createdAt, body: "edited", authorName: "Teammate" }));
    expect(updated[0].body).toBe("edited");
    expect(updated[0].authorName).toBe("Ada");
    expect(updated[0].attachments).toHaveLength(1);

    const withFile = upsertAttachment(updated, "1", {
      id: "file-2",
      fileName: "b.png",
      fileUrl: "https://example.test/b.png",
      mimeType: "image/png",
      sizeBytes: 20,
    });
    expect(withFile[0].attachments.map((file) => file.id)).toEqual(["file", "file-2"]);
    expect(removeComment([
      comment({ id: "1", createdAt: "2026-10-20T10:00:00Z" }),
      comment({ id: "2", createdAt: "2026-10-20T10:01:00Z", parentId: "1" }),
    ], "1")).toEqual([]);
  });

  it("lets the author edit chat messages and notes only", () => {
    expect(canModifyComment(comment({ id: "1", createdAt: "t" }), ada)).toBe(true);
    expect(canModifyComment(comment({ id: "1", createdAt: "t", commentType: "note" }), ada)).toBe(true);
    expect(canModifyComment(comment({ id: "1", createdAt: "t", commentType: "review_approve" }), ada)).toBe(false);
    expect(canModifyComment(comment({ id: "1", createdAt: "t" }), ben)).toBe(false);
  });
});

describe("discussion files", () => {
  it("rejects oversize and unsupported files", () => {
    expect(validateDiscussionFile({ name: "big.pdf", size: 11 * 1024 * 1024, type: "application/pdf" })).toMatch(/10 MB/);
    expect(validateDiscussionFile({ name: "run.exe", size: 12, type: "application/octet-stream" })).toMatch(/supported/);
    expect(validateDiscussionFile({ name: "note.txt", size: 12, type: "text/plain" })).toBeNull();
  });

  it("only links http(s) attachment urls", () => {
    expect(safeHttpUrl("https://firebasestorage.googleapis.com/v0/b/bucket/o/file?alt=media&token=abc")).toMatch(/^https:/);
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
  });
});
