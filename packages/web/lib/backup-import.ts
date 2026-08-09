import type { ImportBackupMode } from "@/types";

export class ReplaceBackupPreparationError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("Failed to prepare a recovery backup before replace import");
    this.name = "ReplaceBackupPreparationError";
    this.cause = cause;
  }
}

type BackupImportResult<TResult> =
  | { status: "cancelled" }
  | { status: "imported"; result: TResult };

interface RunBackupImportOptions<TPayload, TRecoveryPayload, TResult> {
  mode: ImportBackupMode;
  payload: TPayload;
  confirmInitialReplace: () => boolean | Promise<boolean>;
  createRecoveryBackup: () => Promise<TRecoveryPayload>;
  downloadRecoveryBackup: (
    payload: TRecoveryPayload,
  ) => void | Promise<void>;
  confirmFinalReplace: () => boolean | Promise<boolean>;
  importPayload: (
    payload: TPayload,
    mode: ImportBackupMode,
  ) => Promise<TResult>;
  applyImportedPayload: (payload: TPayload) => void | Promise<void>;
}

export async function runBackupImport<TPayload, TRecoveryPayload, TResult>({
  mode,
  payload,
  confirmInitialReplace,
  createRecoveryBackup,
  downloadRecoveryBackup,
  confirmFinalReplace,
  importPayload,
  applyImportedPayload,
}: RunBackupImportOptions<
  TPayload,
  TRecoveryPayload,
  TResult
>): Promise<BackupImportResult<TResult>> {
  if (mode === "replace") {
    if (!(await confirmInitialReplace())) {
      return { status: "cancelled" };
    }

    try {
      const recoveryPayload = await createRecoveryBackup();
      await downloadRecoveryBackup(recoveryPayload);
    } catch (error) {
      throw new ReplaceBackupPreparationError(error);
    }

    if (!(await confirmFinalReplace())) {
      return { status: "cancelled" };
    }
  }

  const result = await importPayload(payload, mode);
  await applyImportedPayload(payload);

  return { status: "imported", result };
}
