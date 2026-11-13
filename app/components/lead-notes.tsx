"use client";

import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation, usePaginatedQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Component, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import type { Lead } from "@/lib/leads";
import { MAX_NOTE_LENGTH } from "@/lib/note-limits";

function noteError(error: unknown) {
  return error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : "Unable to save changes. Please check your connection and try again.";
}

class NotesErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="space-y-3 rounded-lg bg-red-50 p-4 text-sm text-red-800">
          <p>Unable to load notes. Check your connection and that the Convex notes functions are configured.</p>
          <button type="button" onClick={() => this.setState({ failed: false })} className="rounded-lg border border-red-200 px-3 py-2">Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function NoteForm({ initialContent = "", label, onSave, onCancel }: {
  initialContent?: string;
  label: string;
  onSave: (content: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [content, setContent] = useState(initialContent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > MAX_NOTE_LENGTH) {
      setError(`Enter a note between 1 and ${MAX_NOTE_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(trimmed);
      setContent("");
    } catch (failure) {
      setError(noteError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-medium">
        {label}
        <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={MAX_NOTE_LENGTH} required disabled={busy} rows={4} className="mt-2 block w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60" />
      </label>
      <p className="text-xs text-slate-500">{content.length}/{MAX_NOTE_LENGTH} characters</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={busy || !content.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Saving…" : "Save note"}</button>
        {onCancel && <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">Cancel</button>}
      </div>
    </form>
  );
}

function NoteItem({ note }: { note: Doc<"leadNotes"> }) {
  const update = useMutation(api.leadNotes.update);
  const remove = useMutation(api.leadNotes.remove);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteNote() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await remove({ noteId: note._id });
    } catch (failure) {
      setError(noteError(failure));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      {editing ? (
        <NoteForm initialContent={note.content} label="Edit note" onCancel={() => setEditing(false)} onSave={async (content) => {
          await update({ noteId: note._id, content });
          setEditing(false);
        }} />
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{note.content}</p>
          <p className="text-xs text-slate-500">
            Created <time dateTime={new Date(note.createdAt).toISOString()}>{new Date(note.createdAt).toLocaleString()}</time>
            {note.updatedAt !== note.createdAt && <> · Updated <time dateTime={new Date(note.updatedAt).toISOString()}>{new Date(note.updatedAt).toLocaleString()}</time></>}
          </p>
          {confirmDelete ? (
            <div className="space-y-2">
              <p className="text-sm">Delete this note permanently?</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => void deleteNote()} disabled={deleting} className="rounded-lg bg-red-700 px-3 py-2 text-sm text-white disabled:opacity-50">{deleting ? "Deleting…" : "Delete note"}</button>
                <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button type="button" onClick={() => setEditing(true)} className="rounded px-2 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-50">Edit</button>
              <button type="button" onClick={() => setConfirmDelete(true)} className="rounded px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50">Delete</button>
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </li>
  );
}

function NotesContent({ lead }: { lead: Lead }) {
  const create = useMutation(api.leadNotes.create);
  const { results, status, loadMore } = usePaginatedQuery(api.leadNotes.list, { salesforceLeadId: lead.id }, { initialNumItems: 10 });

  return (
    <div className="space-y-6">
      <NoteForm label="Add a note" onSave={async (content) => {
        await create({ salesforceLeadId: lead.id, content });
      }} />
      <section aria-label="Your saved notes" className="space-y-3 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold">Your saved notes</h3>
        {status === "LoadingFirstPage" && <p role="status" className="text-sm text-slate-500">Loading notes…</p>}
        {status !== "LoadingFirstPage" && results.length === 0 && <p className="text-sm text-slate-500">You haven’t added any notes for this lead yet.</p>}
        <ul className="space-y-3">{results.map((note) => <NoteItem key={note._id} note={note} />)}</ul>
        {(status === "CanLoadMore" || status === "LoadingMore") && <button type="button" disabled={status === "LoadingMore"} onClick={() => loadMore(10)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">{status === "LoadingMore" ? "Loading…" : "Load more notes"}</button>}
      </section>
    </div>
  );
}

export default function LeadNotes({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { userId } = useAuth();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="notes-heading" aria-describedby="notes-description" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/40">
      <div className="mb-2 flex items-start justify-between gap-4">
        <h2 id="notes-heading" className="text-xl font-semibold">Notes for {lead.name}</h2>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Close</button>
      </div>
      <p id="notes-description" className="mb-6 text-sm text-slate-500">Only you can access these notes.</p>
      {isLoading ? <p role="status" className="text-sm">Checking authentication…</p> : isAuthenticated && userId ? (
        <NotesErrorBoundary key={`${userId}:${lead.id}`}><NotesContent lead={lead} /></NotesErrorBoundary>
      ) : <p role="alert" className="text-sm text-red-700">Notes require an authenticated Convex session. Sign in again or check the Clerk + Convex configuration.</p>}
    </dialog>
  );
}
