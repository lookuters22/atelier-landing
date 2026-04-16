import { useEffect, useRef, useState } from "react";
import type { WeddingEntry } from "../data/weddingCatalog";
import type { WeddingPersonRow } from "../data/weddingPeopleDefaults";
import type { Tables } from "../types/database.types";
import {
  loadWeddingDetailPersisted,
  saveWeddingDetailPersisted,
  type WeddingFieldsEditable,
} from "../lib/weddingDetailStorage";
import { buildWeddingDetailDefaults } from "../lib/weddingDetailUtils";

function clientsToPeople(clients: Tables<"clients">[]): WeddingPersonRow[] {
  return clients.map((c) => ({
    id: c.id,
    name: c.name,
    subtitle: [c.role, c.email].filter(Boolean).join(" \u00b7 "),
  }));
}

export function useWeddingDetailState({
  weddingId,
  entry,
  liveClients,
  showToast,
}: {
  weddingId: string;
  entry: WeddingEntry;
  liveClients: Tables<"clients">[];
  showToast: (message: string) => void;
}) {
  const defaults = buildWeddingDetailDefaults(weddingId, entry);
  const initialPeople = liveClients.length > 0 ? clientsToPeople(liveClients) : defaults.people;

  const [weddingFields, setWeddingFields] = useState<WeddingFieldsEditable>(() =>
    loadWeddingDetailPersisted(weddingId, { ...defaults, people: initialPeople }).wedding,
  );
  const [people, setPeople] = useState<WeddingPersonRow[]>(() =>
    loadWeddingDetailPersisted(weddingId, { ...defaults, people: initialPeople }).people,
  );
  const [photographerNotes, setPhotographerNotes] = useState(() =>
    loadWeddingDetailPersisted(weddingId, { ...defaults, people: initialPeople }).photographerNotes,
  );
  const [editingWedding, setEditingWedding] = useState(false);
  const [editingPeople, setEditingPeople] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);

  const weddingBackupRef = useRef<WeddingFieldsEditable | null>(null);
  const peopleBackupRef = useRef<WeddingPersonRow[] | null>(null);
  const weddingFieldsRef = useRef(weddingFields);
  const peopleRef = useRef(people);
  weddingFieldsRef.current = weddingFields;
  peopleRef.current = people;

  /** Reset edit mode when switching projects. */
  useEffect(() => {
    setEditingWedding(false);
    setEditingPeople(false);
  }, [weddingId]);

  /**
   * Live CRM row (`entry`) wins for core wedding identity + commercial summary fields.
   * LocalStorage only supplies extra overlay for keys not replaced here; skipped while the user is editing the wedding card.
   */
  useEffect(() => {
    const base = buildWeddingDetailDefaults(weddingId, entry);
    const loaded = loadWeddingDetailPersisted(weddingId, base);
    if (editingWedding) return;
    setWeddingFields({
      ...loaded.wedding,
      couple: entry.couple,
      when: entry.when,
      where: entry.where,
      stage: entry.stage,
      package: entry.package,
      value: entry.value,
      balance: entry.balance,
    });
    setPhotographerNotes(loaded.photographerNotes);
  }, [
    weddingId,
    editingWedding,
    entry.couple,
    entry.when,
    entry.where,
    entry.stage,
    entry.package,
    entry.value,
    entry.balance,
  ]);

  useEffect(() => {
    if (liveClients.length > 0) {
      setPeople(clientsToPeople(liveClients));
    }
  }, [liveClients]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      saveWeddingDetailPersisted(weddingId, {
        wedding: weddingFieldsRef.current,
        people: peopleRef.current,
        photographerNotes,
      });
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [photographerNotes, weddingId]);

  function persistWeddingDetail() {
    saveWeddingDetailPersisted(weddingId, {
      wedding: weddingFields,
      people,
      photographerNotes,
    });
  }

  function startEditWedding() {
    weddingBackupRef.current = { ...weddingFields };
    setEditingWedding(true);
  }

  function cancelEditWedding() {
    if (weddingBackupRef.current) setWeddingFields(weddingBackupRef.current);
    setEditingWedding(false);
  }

  function saveEditWedding() {
    persistWeddingDetail();
    showToast("Wedding details saved.");
    setEditingWedding(false);
  }

  function startEditPeople() {
    peopleBackupRef.current = people.map((person) => ({ ...person }));
    setEditingPeople(true);
  }

  function cancelEditPeople() {
    if (peopleBackupRef.current) setPeople(peopleBackupRef.current.map((person) => ({ ...person })));
    setEditingPeople(false);
  }

  function saveEditPeople() {
    persistWeddingDetail();
    showToast("People updated.");
    setEditingPeople(false);
  }

  function addPersonRow() {
    setPeople((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: "",
        subtitle: "",
      },
    ]);
  }

  function removePersonRow(id: string) {
    setPeople((prev) => prev.filter((person) => person.id !== id));
  }

  function updatePerson(id: string, patch: Partial<WeddingPersonRow>) {
    setPeople((prev) => prev.map((person) => (person.id === id ? { ...person, ...patch } : person)));
  }

  function regenerateSummary() {
    setSummaryBusy(true);
    window.setTimeout(() => {
      setSummaryBusy(false);
      showToast("Summary refreshed from the last 30 messages (demo).");
    }, 900);
  }

  return {
    weddingFields,
    setWeddingFields,
    people,
    photographerNotes,
    setPhotographerNotes,
    editingWedding,
    editingPeople,
    summaryBusy,
    startEditWedding,
    cancelEditWedding,
    saveEditWedding,
    startEditPeople,
    cancelEditPeople,
    saveEditPeople,
    addPersonRow,
    removePersonRow,
    updatePerson,
    regenerateSummary,
  };
}
