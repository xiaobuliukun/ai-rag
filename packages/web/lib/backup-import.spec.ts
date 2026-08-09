import {
  ReplaceBackupPreparationError,
  runBackupImport,
} from "./backup-import";

describe("backup import safety", () => {
  it("applies a committed replace even when search indexing remains pending", async () => {
    const calls: string[] = [];
    const incomingPayload = { id: "incoming" };
    const recoveryPayload = { id: "current" };

    const outcome = await runBackupImport({
      mode: "replace",
      payload: incomingPayload,
      confirmInitialReplace: () => {
        calls.push("confirm-initial");
        return true;
      },
      createRecoveryBackup: async () => {
        calls.push("create-recovery");
        return recoveryPayload;
      },
      downloadRecoveryBackup: (payload) => {
        calls.push(`download-${payload.id}`);
      },
      confirmFinalReplace: () => {
        calls.push("confirm-final");
        return true;
      },
      importPayload: async (payload, mode) => {
        calls.push(`import-${mode}-${payload.id}`);
        return {
          success: true,
          indexPending: true,
          message: "Replacement committed; search indexing is pending",
        };
      },
      applyImportedPayload: (payload) => {
        calls.push(`apply-${payload.id}`);
      },
    });

    expect(outcome).toEqual({
      status: "imported",
      result: {
        success: true,
        indexPending: true,
        message: "Replacement committed; search indexing is pending",
      },
    });
    expect(calls).toEqual([
      "confirm-initial",
      "create-recovery",
      "download-current",
      "confirm-final",
      "import-replace-incoming",
      "apply-incoming",
    ]);
  });

  it("does not create a recovery backup or import after the first cancellation", async () => {
    const createRecoveryBackup = jest.fn(async () => ({ id: "current" }));
    const importPayload = jest.fn(async () => ({ success: true }));
    const applyImportedPayload = jest.fn();

    const outcome = await runBackupImport({
      mode: "replace",
      payload: { id: "incoming" },
      confirmInitialReplace: () => false,
      createRecoveryBackup,
      downloadRecoveryBackup: jest.fn(),
      confirmFinalReplace: jest.fn(() => true),
      importPayload,
      applyImportedPayload,
    });

    expect(outcome).toEqual({ status: "cancelled" });
    expect(createRecoveryBackup).not.toHaveBeenCalled();
    expect(importPayload).not.toHaveBeenCalled();
    expect(applyImportedPayload).not.toHaveBeenCalled();
  });

  it("keeps the downloaded recovery backup but does not import after final cancellation", async () => {
    const downloadRecoveryBackup = jest.fn();
    const importPayload = jest.fn(async () => ({ success: true }));
    const applyImportedPayload = jest.fn();

    const outcome = await runBackupImport({
      mode: "replace",
      payload: { id: "incoming" },
      confirmInitialReplace: () => true,
      createRecoveryBackup: async () => ({ id: "current" }),
      downloadRecoveryBackup,
      confirmFinalReplace: () => false,
      importPayload,
      applyImportedPayload,
    });

    expect(outcome).toEqual({ status: "cancelled" });
    expect(downloadRecoveryBackup).toHaveBeenCalledWith({ id: "current" });
    expect(importPayload).not.toHaveBeenCalled();
    expect(applyImportedPayload).not.toHaveBeenCalled();
  });

  it("does not import when creating the recovery backup fails", async () => {
    const importPayload = jest.fn(async () => ({ success: true }));
    const applyImportedPayload = jest.fn();

    await expect(
      runBackupImport({
        mode: "replace",
        payload: { id: "incoming" },
        confirmInitialReplace: () => true,
        createRecoveryBackup: async () => {
          throw new Error("export failed");
        },
        downloadRecoveryBackup: jest.fn(),
        confirmFinalReplace: jest.fn(() => true),
        importPayload,
        applyImportedPayload,
      }),
    ).rejects.toBeInstanceOf(ReplaceBackupPreparationError);

    expect(importPayload).not.toHaveBeenCalled();
    expect(applyImportedPayload).not.toHaveBeenCalled();
  });

  it("applies imported preferences only after a successful merge import", async () => {
    const calls: string[] = [];

    await runBackupImport({
      mode: "merge",
      payload: { id: "incoming" },
      confirmInitialReplace: jest.fn(() => true),
      createRecoveryBackup: jest.fn(async () => ({ id: "current" })),
      downloadRecoveryBackup: jest.fn(),
      confirmFinalReplace: jest.fn(() => true),
      importPayload: async () => {
        calls.push("import");
        return { success: true };
      },
      applyImportedPayload: () => {
        calls.push("apply");
      },
    });

    expect(calls).toEqual(["import", "apply"]);
  });

  it("does not apply imported preferences when the import fails", async () => {
    const applyImportedPayload = jest.fn();

    await expect(
      runBackupImport({
        mode: "merge",
        payload: { id: "incoming" },
        confirmInitialReplace: jest.fn(() => true),
        createRecoveryBackup: jest.fn(async () => ({ id: "current" })),
        downloadRecoveryBackup: jest.fn(),
        confirmFinalReplace: jest.fn(() => true),
        importPayload: async () => {
          throw new Error("import failed");
        },
        applyImportedPayload,
      }),
    ).rejects.toThrow("import failed");

    expect(applyImportedPayload).not.toHaveBeenCalled();
  });
});
