import type { BackupPayload } from "@moxu/shared";

export type DesktopImageSelection = {
  dataUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export type DesktopBridge = {
  platform?: string;
  apiBaseUrl?: string;
  apiAccessToken?: string;
  selectDirectory?: () => Promise<string | null>;
  saveBackup?: (
    payload: BackupPayload,
    filename?: string,
  ) => Promise<{ canceled: boolean; filePath?: string }>;
  chooseBackup?: () => Promise<BackupPayload | null>;
  chooseImage?: () => Promise<DesktopImageSelection | null>;
  confirm?: (message: string) => Promise<boolean>;
};

declare global {
  interface Window {
    moxuDesktop?: DesktopBridge;
  }
}

