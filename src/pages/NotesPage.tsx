import { ScratchNotesPanel } from "@/components/ScratchNotesPanel";
import { PageHeader } from "@/components/PageHeader";

const NotesPage = () => (
  <div className="p-4 md:p-6 max-w-3xl page-enter">
    <PageHeader
      title="Quick Notes"
      description="Private to you. Each note shows how long it has left and is removed after 7 days."
    />
    <ScratchNotesPanel />
  </div>
);

export default NotesPage;
