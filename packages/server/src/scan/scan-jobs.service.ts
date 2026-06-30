import { Injectable, NotFoundException } from '@nestjs/common';
import type { ScanJobStatus } from '@moxu/shared';
import { randomUUID } from 'crypto';
import {
  ensureDirSync,
  existsSync,
  readJsonSync,
  writeJsonSync,
} from 'fs-extra';
import { dirname, join } from 'path';
import { ScanCancelledError, ScanProgress, ScanService } from './scan.service';

const MAX_JOBS = 24;
const ACTIVE_PHASES = new Set<ScanJobStatus['phase']>([
  'queued',
  'scanning',
  'indexing',
]);

function getScanJobsFilePath() {
  return (
    process.env.SCAN_JOBS_FILE || join(process.cwd(), '.moxu', 'scan-jobs.json')
  );
}

@Injectable()
export class ScanJobsService {
  private readonly jobs = new Map<string, ScanJobStatus>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly jobsFilePath = getScanJobsFilePath();

  constructor(private readonly scanService: ScanService) {
    this.loadJobs();
  }

  startScan(rootPath: string) {
    const job = this.createJob(rootPath);
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    void this.runJob(job.id, controller, () =>
      this.scanService.scanDirectory(rootPath, {
        signal: controller.signal,
        onProgress: (progress) => this.updateProgress(job.id, progress),
      }),
    );
    return job;
  }

  startRescanKnownBooks() {
    const job = this.createJob(undefined, 'Rescanning known books');
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    void this.runJob(job.id, controller, () =>
      this.scanService.rescanKnownBooks({
        signal: controller.signal,
        onProgress: (progress) => this.updateProgress(job.id, progress),
      }),
    );
    return job;
  }

  getJob(id: string) {
    const job = this.jobs.get(id);
    if (!job) {
      throw new NotFoundException('Scan job not found');
    }
    return job;
  }

  cancelJob(id: string) {
    const job = this.getJob(id);
    if (!ACTIVE_PHASES.has(job.phase)) {
      return job;
    }

    this.controllers.get(id)?.abort();
    this.patchJob(id, {
      phase: 'cancelled',
      success: false,
      message: 'Scan cancelled',
      currentBook: undefined,
      completedAt: new Date().toISOString(),
    });
    return this.getJob(id);
  }

  private createJob(rootPath?: string, message = 'Queued scan') {
    const now = new Date().toISOString();
    const job: ScanJobStatus = {
      id: randomUUID(),
      phase: 'queued',
      success: false,
      message,
      rootPath,
      booksTotal: 0,
      booksScanned: 0,
      chaptersScanned: 0,
      skippedBooks: 0,
      startedAt: now,
      updatedAt: now,
    };

    this.jobs.set(job.id, job);
    this.pruneJobs();
    this.saveJobs();
    return job;
  }

  private async runJob(
    id: string,
    controller: AbortController,
    action: () => Promise<{
      success: boolean;
      message: string;
      booksScanned?: number;
      chaptersScanned?: number;
      skippedBooks?: number;
    }>,
  ) {
    this.updateProgress(id, {
      phase: 'scanning',
      message: 'Starting scan',
    });

    try {
      const result = await action();
      this.patchJob(id, {
        phase: 'completed',
        success: result.success,
        message: result.message,
        booksScanned: result.booksScanned ?? 0,
        chaptersScanned: result.chaptersScanned ?? 0,
        skippedBooks: result.skippedBooks ?? 0,
        currentBook: undefined,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (controller.signal.aborted || error instanceof ScanCancelledError) {
        this.patchJob(id, {
          phase: 'cancelled',
          success: false,
          message: 'Scan cancelled',
          currentBook: undefined,
          completedAt: new Date().toISOString(),
        });
        return;
      }

      this.patchJob(id, {
        phase: 'failed',
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Scan job failed unexpectedly',
        error:
          error instanceof Error
            ? error.message
            : 'Scan job failed unexpectedly',
        currentBook: undefined,
        completedAt: new Date().toISOString(),
      });
    } finally {
      this.controllers.delete(id);
    }
  }

  private updateProgress(id: string, progress: ScanProgress) {
    this.patchJob(id, {
      ...progress,
      success: false,
    });
  }

  private patchJob(id: string, patch: Partial<ScanJobStatus>) {
    const current = this.jobs.get(id);
    if (!current) {
      return;
    }

    this.jobs.set(id, {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    this.saveJobs();
  }

  private pruneJobs() {
    if (this.jobs.size <= MAX_JOBS) {
      return;
    }

    const removable = Array.from(this.jobs.values())
      .filter((job) => job.phase === 'completed' || job.phase === 'failed')
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));

    for (const job of removable.slice(0, this.jobs.size - MAX_JOBS)) {
      this.jobs.delete(job.id);
    }
  }

  private loadJobs() {
    if (!existsSync(this.jobsFilePath)) {
      return;
    }

    try {
      const payload = readJsonSync(this.jobsFilePath) as unknown;
      const jobs = Array.isArray(payload) ? payload : [];
      for (const job of jobs) {
        if (!isPersistedScanJob(job)) {
          continue;
        }

        this.jobs.set(job.id, {
          ...job,
          ...(ACTIVE_PHASES.has(job.phase)
            ? {
                phase: 'failed',
                success: false,
                message: 'Server restarted before this scan finished',
                error: 'Server restarted before this scan finished',
                currentBook: undefined,
                completedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : {}),
        });
      }
      this.pruneJobs();
      this.saveJobs();
    } catch {
      this.jobs.clear();
    }
  }

  private saveJobs() {
    ensureDirSync(dirname(this.jobsFilePath));
    writeJsonSync(this.jobsFilePath, Array.from(this.jobs.values()), {
      spaces: 2,
    });
  }
}

function isPersistedScanJob(value: unknown): value is ScanJobStatus {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as ScanJobStatus).id === 'string' &&
    typeof (value as ScanJobStatus).phase === 'string' &&
    typeof (value as ScanJobStatus).message === 'string'
  );
}
