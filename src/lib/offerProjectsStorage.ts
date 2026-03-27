import type { Data } from "@measured/puck";
import { OFFER_PUCK_STORAGE_KEY } from "./offerHtmlDocument";
import { defaultPuckData, normalizePuckData, projectDisplayName } from "./offerPuckNormalize";
import { loadJson, saveJson } from "./settingsStorage";

export const OFFER_PROJECTS_KEY = "atelier-offer-projects-v1";

export type OfferProjectRecord = {
  id: string;
  name: string;
  updatedAt: string;
  data: Data;
};

type ProjectsFile = { projects: OfferProjectRecord[] };

function readStore(): ProjectsFile {
  return loadJson<ProjectsFile>(OFFER_PROJECTS_KEY, { projects: [] });
}

function writeStore(store: ProjectsFile): void {
  saveJson(OFFER_PROJECTS_KEY, store);
}

let migrated = false;

function migrateLegacyIfNeeded(): void {
  if (migrated) return;
  migrated = true;
  const store = readStore();
  if (store.projects.length > 0) return;

  const legacy = loadJson<Data | null>(OFFER_PUCK_STORAGE_KEY, null);
  if (!legacy || !legacy.root || !Array.isArray(legacy.content)) return;

  const id = crypto.randomUUID();
  const data = normalizePuckData(legacy);
  const project: OfferProjectRecord = {
    id,
    name: projectDisplayName(data),
    updatedAt: new Date().toISOString(),
    data,
  };
  writeStore({ projects: [project] });
}

export function listOfferProjects(): OfferProjectRecord[] {
  migrateLegacyIfNeeded();
  const { projects } = readStore();
  return [...projects].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getOfferProject(id: string): OfferProjectRecord | undefined {
  migrateLegacyIfNeeded();
  return readStore().projects.find((p) => p.id === id);
}

export function upsertOfferProject(project: OfferProjectRecord): void {
  migrateLegacyIfNeeded();
  const store = readStore();
  const i = store.projects.findIndex((p) => p.id === project.id);
  if (i >= 0) store.projects[i] = project;
  else store.projects.push(project);
  writeStore(store);
}

export function deleteOfferProject(id: string): void {
  migrateLegacyIfNeeded();
  const store = readStore();
  store.projects = store.projects.filter((p) => p.id !== id);
  writeStore(store);
}

export function createOfferProject(): OfferProjectRecord {
  migrateLegacyIfNeeded();
  const id = crypto.randomUUID();
  const data = defaultPuckData();
  const project: OfferProjectRecord = {
    id,
    name: "Untitled",
    updatedAt: new Date().toISOString(),
    data,
  };
  upsertOfferProject(project);
  return project;
}
