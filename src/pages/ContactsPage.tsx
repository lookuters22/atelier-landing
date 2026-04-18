import { Link } from "react-router-dom";

/** Legacy route `/contacts` redirects to `/directory` in App; this page is unused but kept for imports. */
export function ContactsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Contacts</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          Contacts live in the Directory.{" "}
          <Link to="/directory" className="font-medium text-link hover:underline">
            Open Directory
          </Link>
        </p>
      </div>
    </div>
  );
}
