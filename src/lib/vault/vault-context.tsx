/**
 * In-memory unlocked vault. On disk there is only one encrypted HMVAULT1 blob.
 * Decrypted seeds and the password live in memory only and are dropped on lock.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { lockText, unlockText } from "./format";
import {
  emptyVault,
  encryptVaultBackup,
  hasNewVaultEntries,
  mergeVaultBackup,
  lockoutMs,
  parsePayload,
  shouldAutoLock,
  type SeedEntry,
} from "./seeds";
import { MAX_VAULT_CHARS, type SecretEntry } from "./secrets";
import { setCoinExtraRequired } from "./coin-unlock";
import { disableBiometric } from "../native/biometric";

const VAULT_KEY = "hmsv.vault.v1";
const FAILS_KEY = "hmsv.fails.v1";

type Status = "loading" | "none" | "locked" | "unlocked";

interface Ctx {
  status: Status;
  backupReminder: boolean;
  dismissBackupReminder: () => void;
  seeds: SeedEntry[];
  secrets: SecretEntry[];
  pendingCode: string;
  setPendingCode: (code: string) => void;
  waitUntil: number;
  create: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  checkPassword: (password: string) => boolean;
  changePassword: (current: string, next: string) => Promise<void>;
  save: (seeds: SeedEntry[]) => Promise<void>;
  saveSecrets: (secrets: SecretEntry[]) => Promise<void>;
  restore: (seeds: SeedEntry[], secrets: SecretEntry[]) => Promise<void>;
  exportBackup: () => Promise<string>;
  importBackup: (
    code: string,
    sourceCredential?: string,
  ) => Promise<{ addedSeeds: number; addedSecrets: number; skipped: number }>;
  wipe: () => void;
}

const VaultCtx = createContext<Ctx | null>(null);

function readFails(): { n: number; until: number } {
  try {
    return JSON.parse(localStorage.getItem(FAILS_KEY) ?? "") as { n: number; until: number };
  } catch {
    return { n: 0, until: 0 };
  }
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [backupReminder, setBackupReminder] = useState(false);
  const dismissBackupReminder = useCallback(() => setBackupReminder(false), []);
  const [seeds, setSeeds] = useState<SeedEntry[]>([]);
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  // Ciphertext only: survives Android's file picker background lock, never stored on disk.
  const [pendingCode, setPendingCode] = useState("");
  const data = useRef({ seeds: [] as SeedEntry[], secrets: [] as SecretEntry[] });
  const generation = useRef(0);
  const writing = useRef(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const pw = useRef<string | null>(null);
  const lastActive = useRef(Date.now());

  useEffect(() => {
    setStatus(localStorage.getItem(VAULT_KEY) ? "locked" : "none");
    setWaitUntil(readFails().until);
  }, []);

  const lock = useCallback(() => {
    generation.current++;
    setBackupReminder(false);
    pw.current = null;
    setSeeds([]);
    setSecrets([]);
    data.current = { seeds: [], secrets: [] };
    setStatus((s) => (s === "unlocked" ? "locked" : s));
  }, []);

  const persist = useCallback(async (list: SeedEntry[], items: SecretEntry[], password: string) => {
    if (writing.current) throw new Error("Another save is in progress. Please try again.");
    writing.current = true;
    const version = generation.current;
    try {
      const text = JSON.stringify({ ...emptyVault(), seeds: list, secrets: items });
      if (text.length > MAX_VAULT_CHARS)
        throw new Error("Vault is full. Keep the collection under 2 MB.");
      const encrypted = await lockText(text, password);
      if (generation.current !== version)
        throw new Error("Vault locked before saving. Unlock and try again.");
      try {
        localStorage.setItem(VAULT_KEY, encrypted);
      } catch {
        throw new Error("Not enough device storage. Nothing was changed.");
      }
      if (hasNewVaultEntries(data.current, { seeds: list, secrets: items }))
        setBackupReminder(true);
      data.current = { seeds: list, secrets: items };
      setSeeds(list);
      setSecrets(items);
    } finally {
      writing.current = false;
    }
  }, []);

  const create = useCallback(
    async (password: string) => {
      await persist([], [], password);
      pw.current = password;
      setSeeds([]);
      setStatus("unlocked");
    },
    [persist],
  );

  const unlock = useCallback(async (password: string) => {
    const f = readFails();
    if (f.until > Date.now()) throw new Error("Too many wrong tries. Please wait.");
    const blob = localStorage.getItem(VAULT_KEY);
    if (!blob) throw new Error("No vault on this device.");
    // Locking (or erasing) while the slow key derivation runs must win.
    const version = generation.current;
    let text: string;
    try {
      text = await unlockText(blob, password);
    } catch {
      const n = f.n + 1;
      const until = Date.now() + lockoutMs(n);
      localStorage.setItem(FAILS_KEY, JSON.stringify({ n, until }));
      setWaitUntil(until);
      throw new Error("Wrong password.");
    }
    if (generation.current !== version || document.visibilityState === "hidden")
      throw new Error("Vault locked while unlocking. Please try again.");
    {
      const payload = parsePayload(text);
      localStorage.removeItem(FAILS_KEY);
      setWaitUntil(0);
      pw.current = password;
      lastActive.current = Date.now();
      setSeeds(payload.seeds);
      setSecrets(payload.secrets);
      data.current = { seeds: payload.seeds, secrets: payload.secrets };
      setStatus("unlocked");
    }
  }, []);

  const save = useCallback(
    async (list: SeedEntry[]) => {
      if (!pw.current) throw new Error("Vault is locked.");
      await persist(list, data.current.secrets, pw.current);
    },
    [persist],
  );

  const saveSecrets = useCallback(
    async (items: SecretEntry[]) => {
      if (!pw.current) throw new Error("Vault is locked.");
      await persist(data.current.seeds, items, pw.current);
    },
    [persist],
  );
  const restore = useCallback(
    async (list: SeedEntry[], items: SecretEntry[]) => {
      if (!pw.current) throw new Error("Vault is locked.");
      await persist(list, items, pw.current);
    },
    [persist],
  );

  const checkPassword = useCallback((p: string) => pw.current !== null && p === pw.current, []);

  const exportBackup = useCallback(async () => {
    if (pw.current === null) throw new Error("Vault is locked.");
    const version = generation.current;
    const code = await encryptVaultBackup({ ...emptyVault(), ...data.current }, pw.current);
    if (generation.current !== version) throw new Error("Vault locked. Unlock and try again.");
    return code;
  }, []);

  const importBackup = useCallback(
    async (code: string, sourceCredential?: string) => {
      if (pw.current === null) throw new Error("Vault is locked.");
      const version = generation.current;
      const incoming = parsePayload(await unlockText(code, sourceCredential ?? pw.current));
      if (generation.current !== version || pw.current === null)
        throw new Error("Vault locked. Unlock and try again.");
      const result = mergeVaultBackup({ ...emptyVault(), ...data.current }, incoming);
      await persist(result.payload.seeds, result.payload.secrets, pw.current);
      return {
        addedSeeds: result.addedSeeds,
        addedSecrets: result.addedSecrets,
        skipped: result.skipped,
      };
    },
    [persist],
  );

  const changePassword = useCallback(
    async (current: string, next: string) => {
      if (pw.current === null || current !== pw.current) throw new Error("Wrong password.");
      // The fingerprint-sealed copy holds the OLD credential; drop it before re-keying.
      await disableBiometric();
      await persist(data.current.seeds, data.current.secrets, next);
      pw.current = next;
    },
    [persist],
  );

  const wipe = useCallback(() => {
    generation.current++;
    setBackupReminder(false);
    localStorage.removeItem(VAULT_KEY);
    localStorage.removeItem(FAILS_KEY);
    setCoinExtraRequired(false);
    pw.current = null;
    setSeeds([]);
    setSecrets([]);
    data.current = { seeds: [], secrets: [] };
    setStatus("none");
    setPendingCode("");
  }, []);

  // Auto-lock: 2 minutes idle, or as soon as the app is hidden/backgrounded.
  useEffect(() => {
    if (status !== "unlocked") return;
    const touch = () => (lastActive.current = Date.now());
    const onHide = () => document.visibilityState === "hidden" && lock();
    const t = setInterval(() => shouldAutoLock(lastActive.current, Date.now()) && lock(), 5_000);
    const evs = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", lock);
    return () => {
      clearInterval(t);
      evs.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", lock);
    };
  }, [status, lock]);

  return (
    <VaultCtx.Provider
      value={{
        status,
        backupReminder,
        dismissBackupReminder,
        seeds,
        secrets,
        pendingCode,
        setPendingCode,
        waitUntil,
        create,
        unlock,
        lock,
        checkPassword,
        changePassword,
        save,
        saveSecrets,
        restore,
        exportBackup,
        importBackup,
        wipe,
      }}
    >
      {children}
    </VaultCtx.Provider>
  );
}

export function useVault(): Ctx {
  const c = useContext(VaultCtx);
  if (!c) throw new Error("useVault outside VaultProvider");
  return c;
}
