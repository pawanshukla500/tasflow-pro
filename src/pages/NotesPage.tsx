import { ScratchNotesPanel } from "@/components/ScratchNotesPanel";
import { PageHeader } from "@/components/PageHeader";

const NotesPage = () => (
  <div className="p-4 md:p-6">
    <PageHeader
      title="Quick Notes"
      description="Short-term ideas and planning — polish rough English with one click"
    />
    <ScratchNotesPanel />
  </div>
);

export default NotesPage;
