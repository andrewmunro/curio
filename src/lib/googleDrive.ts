import { exportDb, importDb, addWriteListener } from "./db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type DriveState = {
  status: "disconnected" | "connecting" | "connected" | "error";
  email: string | null;
  fileId: string | null;
  fileName: string | null;
  saveStatus: SaveStatus;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FILE_NAME = "curio.db";
const FILE_MIME = "application/octet-stream";
const LS_FILE_ID_KEY = "curio-drive-file-id";
const LS_FILE_NAME_KEY = "curio-drive-file-name";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: DriveState = {
  status: "disconnected",
  email: null,
  fileId: localStorage.getItem(LS_FILE_ID_KEY),
  fileName: localStorage.getItem(LS_FILE_NAME_KEY),
  saveStatus: "idle",
};

const subscribers = new Set<(s: DriveState) => void>();

function setState(next: DriveState): void {
  state = next;
  subscribers.forEach((cb) => cb(state));
}

export function getState(): DriveState {
  return state;
}

export function subscribe(cb: (s: DriveState) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

// ---------------------------------------------------------------------------
// GIS token management
// ---------------------------------------------------------------------------

// google.accounts.oauth2 is loaded from CDN in index.html
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string; expires_in?: number }) => void;
          }): { requestAccessToken(opts?: { prompt?: string }): void };
          revoke(token: string, done: () => void): void;
        };
      };
    };
  }
}

let tokenClient: ReturnType<typeof window.google.accounts.oauth2.initTokenClient> | null = null;
let accessToken: string | null = null;
let tokenExpiry = 0;

function initTokenClient(): void {
  if (!window.google || !CLIENT_ID) return;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (resp) => {
      if (resp.error || !resp.access_token) {
        setState({ ...state, status: "error" });
        return;
      }
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + (resp.expires_in ?? 3600) * 1000 - 60_000;
      // Try to get user info from token introspection isn't available,
      // so we use a simple Drive API call to get the user's email.
      fetchUserEmail().then((email) => {
        setState({ ...state, status: "connected", email });
      });
    },
  });
}

async function fetchUserEmail(): Promise<string | null> {
  try {
    const res = await driveRequest("https://www.googleapis.com/drive/v3/about?fields=user");
    const data = await res.json();
    return data?.user?.emailAddress ?? null;
  } catch {
    return null;
  }
}

async function ensureToken(): Promise<void> {
  if (accessToken && Date.now() < tokenExpiry) return;
  // Silent refresh (no re-consent prompt)
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error("Not initialised"));
      return;
    }
    const originalCallback = (tokenClient as unknown as { callback: (r: unknown) => void }).callback;
    (tokenClient as unknown as { callback: (r: unknown) => void }).callback = (resp: { access_token?: string; error?: string; expires_in?: number }) => {
      originalCallback(resp);
      if (resp.error) reject(new Error(resp.error));
      else resolve();
    };
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

async function driveRequest(url: string, options: RequestInit = {}): Promise<Response> {
  await ensureToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

// ---------------------------------------------------------------------------
// Connect / Disconnect
// ---------------------------------------------------------------------------

export async function connect(): Promise<void> {
  if (!CLIENT_ID) {
    console.error("VITE_GOOGLE_CLIENT_ID is not set");
    return;
  }
  setState({ ...state, status: "connecting" });
  if (!tokenClient) initTokenClient();
  if (!tokenClient) {
    setState({ ...state, status: "error" });
    return;
  }
  tokenClient.requestAccessToken({ prompt: "consent" });
}

export function disconnect(): void {
  if (accessToken && window.google) {
    window.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenExpiry = 0;
  autosaveTimer !== null && clearTimeout(autosaveTimer);
  autosaveTimer = null;
  setState({
    status: "disconnected",
    email: null,
    fileId: state.fileId, // keep so user can reconnect to same file
    fileName: state.fileName,
    saveStatus: "idle",
  });
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

async function uploadNew(): Promise<string> {
  const data = exportDb();
  const metadata = { name: FILE_NAME, mimeType: FILE_MIME };

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", new Blob([data], { type: FILE_MIME }));

  const res = await driveRequest(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
    { method: "POST", body: form }
  );
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
  const json = await res.json();
  return json.id as string;
}

async function uploadExisting(fileId: string): Promise<void> {
  const data = exportDb();
  const res = await driveRequest(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    { method: "PATCH", headers: { "Content-Type": FILE_MIME }, body: data }
  );
  if (!res.ok) throw new Error(`Drive update failed: ${res.status}`);
}

export async function saveToNewFile(): Promise<void> {
  setState({ ...state, saveStatus: "saving" });
  try {
    const fileId = await uploadNew();
    localStorage.setItem(LS_FILE_ID_KEY, fileId);
    localStorage.setItem(LS_FILE_NAME_KEY, FILE_NAME);
    setState({ ...state, fileId, fileName: FILE_NAME, saveStatus: "saved" });
    setTimeout(() => setState({ ...state, fileId, fileName: FILE_NAME, saveStatus: "idle" }), 2000);
  } catch (e) {
    console.error("Drive save failed:", e);
    setState({ ...state, saveStatus: "error" });
    setTimeout(() => setState({ ...state, saveStatus: "idle" }), 3000);
  }
}

export async function saveToExistingFile(): Promise<void> {
  if (!state.fileId) return saveToNewFile();
  setState({ ...state, saveStatus: "saving" });
  try {
    await uploadExisting(state.fileId);
    setState({ ...state, saveStatus: "saved" });
    setTimeout(() => setState({ ...state, saveStatus: "idle" }), 2000);
  } catch (e) {
    console.error("Drive save failed:", e);
    setState({ ...state, saveStatus: "error" });
    setTimeout(() => setState({ ...state, saveStatus: "idle" }), 3000);
  }
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export async function loadFromDrive(fileId?: string): Promise<void> {
  const id = fileId ?? state.fileId;
  if (!id) throw new Error("No file ID");
  const res = await driveRequest(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media`
  );
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  await importDb(new Uint8Array(buffer));
  localStorage.setItem(LS_FILE_ID_KEY, id);
  setState({ ...state, fileId: id });
}

export async function listAppFiles(): Promise<{ id: string; name: string }[]> {
  const res = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?q=name%3D%27${FILE_NAME}%27%20and%20trashed%3Dfalse&fields=files(id%2Cname%2CmodifiedTime)&orderBy=modifiedTime%20desc`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.files ?? []) as { id: string; name: string }[];
}

// ---------------------------------------------------------------------------
// Auto-save on write (debounced, 2 seconds)
// ---------------------------------------------------------------------------

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutosave(): void {
  if (state.status !== "connected" || !state.fileId) return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    saveToExistingFile();
  }, 2000);
}

// Register write listener immediately on module import
addWriteListener(scheduleAutosave);
