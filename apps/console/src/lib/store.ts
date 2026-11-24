import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { CaseResult, GraderSpec, JsonSchema, RunSummary, TestCase } from '@routelab/engine';
import { sanitizeFeatureKey } from '@routelab/shared';

export interface Project {
  id: string;
  name: string;
  createdAt: number;
}
export type GraderType = 'enum' | 'contains' | 'jsonSchemaValid' | 'exact' | 'regex';
export interface Feature {
  id: string;
  name: string;
  /** Remote Config key suffix (routing_<key>). */
  key: string;
  systemPrompt: string;
  userTemplate: string;
  /** JSON schema text for structured output (optional). */
  outputSchema: string;
  graderType: GraderType;
  graderPattern?: string;
  /** 0..1 */
  threshold: number;
}
export interface TestSet {
  id: string;
  name: string;
  source: string;
  featureKey?: string;
  cases: TestCase[];
}
export interface RunDoc {
  id: string;
  featureId: string;
  testsetId: string;
  startedAt: number;
  status: 'running' | 'finished' | 'cancelled';
  env: { chromeVersion: string; nanoAvailability: string };
  summary: RunSummary;
  deviceEvaluated: string;
  appliedAt?: number;
  appliedPayload?: unknown;
}

const strip = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

const col = (db: Firestore, uid: string, ...path: string[]) =>
  collection(db, 'users', uid, ...path);
const ref = (db: Firestore, uid: string, ...path: string[]) =>
  doc(db, 'users', uid, ...(path as [string, ...string[]]));

export async function listProjects(db: Firestore, uid: string): Promise<Project[]> {
  const snap = await getDocs(query(col(db, uid, 'projects'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ ...(d.data() as Omit<Project, 'id'>), id: d.id }));
}
export async function createProject(db: Firestore, uid: string, name: string): Promise<string> {
  const r = await addDoc(col(db, uid, 'projects'), { name, createdAt: Date.now() });
  return r.id;
}
export async function getProject(db: Firestore, uid: string, id: string): Promise<Project | null> {
  const d = await getDoc(ref(db, uid, 'projects', id));
  return d.exists() ? { ...(d.data() as Omit<Project, 'id'>), id } : null;
}

async function listSub<T>(db: Firestore, uid: string, pid: string, sub: string): Promise<T[]> {
  const snap = await getDocs(col(db, uid, 'projects', pid, sub));
  return snap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as T);
}
export const listFeatures = (db: Firestore, uid: string, pid: string) =>
  listSub<Feature>(db, uid, pid, 'features');
export const listTestSets = (db: Firestore, uid: string, pid: string) =>
  listSub<TestSet>(db, uid, pid, 'testsets');
export const listRuns = async (db: Firestore, uid: string, pid: string) =>
  (await listSub<RunDoc>(db, uid, pid, 'runs')).sort((a, b) => b.startedAt - a.startedAt);

export async function getFeature(
  db: Firestore,
  uid: string,
  pid: string,
  id: string,
): Promise<Feature | null> {
  const d = await getDoc(ref(db, uid, 'projects', pid, 'features', id));
  return d.exists() ? ({ ...(d.data() as object), id } as Feature) : null;
}
export async function saveFeature(
  db: Firestore,
  uid: string,
  pid: string,
  f: Omit<Feature, 'id'> & { id?: string },
): Promise<string> {
  const { id, ...data } = f;
  const clean = strip({ ...data, key: sanitizeFeatureKey(data.key || data.name) });
  if (id) {
    await setDoc(ref(db, uid, 'projects', pid, 'features', id), clean);
    return id;
  }
  return (await addDoc(col(db, uid, 'projects', pid, 'features'), clean)).id;
}
export const deleteFeature = (db: Firestore, uid: string, pid: string, id: string) =>
  deleteDoc(ref(db, uid, 'projects', pid, 'features', id));

export async function saveTestSet(
  db: Firestore,
  uid: string,
  pid: string,
  t: Omit<TestSet, 'id'> & { id?: string },
): Promise<string> {
  const { id, ...data } = t;
  if (id) {
    await setDoc(ref(db, uid, 'projects', pid, 'testsets', id), strip(data));
    return id;
  }
  return (await addDoc(col(db, uid, 'projects', pid, 'testsets'), strip(data))).id;
}
export async function getTestSet(
  db: Firestore,
  uid: string,
  pid: string,
  id: string,
): Promise<TestSet | null> {
  const d = await getDoc(ref(db, uid, 'projects', pid, 'testsets', id));
  return d.exists() ? ({ ...(d.data() as object), id } as TestSet) : null;
}
export const deleteTestSet = (db: Firestore, uid: string, pid: string, id: string) =>
  deleteDoc(ref(db, uid, 'projects', pid, 'testsets', id));

export async function getRun(
  db: Firestore,
  uid: string,
  pid: string,
  id: string,
): Promise<RunDoc | null> {
  const d = await getDoc(ref(db, uid, 'projects', pid, 'runs', id));
  return d.exists() ? ({ ...(d.data() as object), id } as RunDoc) : null;
}

/** Saves the run doc (summary is a FIELD) and all per-case results in batches of 400. */
export async function saveRun(
  db: Firestore,
  uid: string,
  pid: string,
  run: Omit<RunDoc, 'id'>,
  results: CaseResult[],
): Promise<string> {
  const runRef = await addDoc(col(db, uid, 'projects', pid, 'runs'), strip(run));
  for (let i = 0; i < results.length; i += 400) {
    const batch = writeBatch(db);
    for (const r of results.slice(i, i + 400)) {
      batch.set(
        doc(
          db,
          'users',
          uid,
          'projects',
          pid,
          'runs',
          runRef.id,
          'results',
          `${r.caseId}_${r.route}`,
        ),
        strip(r),
      );
    }
    await batch.commit();
  }
  return runRef.id;
}
export async function loadResults(
  db: Firestore,
  uid: string,
  pid: string,
  rid: string,
): Promise<CaseResult[]> {
  const snap = await getDocs(col(db, uid, 'projects', pid, 'runs', rid, 'results'));
  return snap.docs.map((d) => d.data() as CaseResult);
}
export const markApplied = (
  db: Firestore,
  uid: string,
  pid: string,
  rid: string,
  payload: unknown,
) =>
  updateDoc(
    ref(db, uid, 'projects', pid, 'runs', rid),
    strip({ appliedAt: Date.now(), appliedPayload: payload }),
  );

/** Turns a feature into the engine's grader spec. */
export function graderSpecFor(f: Feature): GraderSpec {
  switch (f.graderType) {
    case 'enum': {
      let values: string[] | undefined;
      try {
        const s = JSON.parse(f.outputSchema || '{}') as JsonSchema;
        const e = s.properties?.label?.enum;
        if (e) values = e.map(String);
      } catch {
        /* ignore */
      }
      return { type: 'enum', values: values ?? ['allow', 'remove', 'escalate'] };
    }
    case 'jsonSchemaValid':
      return { type: 'jsonSchemaValid', schema: JSON.parse(f.outputSchema || '{}') as JsonSchema };
    case 'regex':
      return { type: 'regex', pattern: f.graderPattern || '.*' };
    case 'exact':
      return { type: 'exact' };
    default:
      return { type: 'contains' };
  }
}
