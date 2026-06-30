import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { ScanJobsService } from './scan-jobs.service';

describe('ScanJobsService', () => {
  const originalScanJobsFile = process.env.SCAN_JOBS_FILE;
  let tempDir: string;
  let scanJobsFile: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moxu-scan-jobs-'));
    scanJobsFile = path.join(tempDir, 'jobs.json');
    process.env.SCAN_JOBS_FILE = scanJobsFile;
  });

  afterEach(async () => {
    if (originalScanJobsFile === undefined) {
      delete process.env.SCAN_JOBS_FILE;
    } else {
      process.env.SCAN_JOBS_FILE = originalScanJobsFile;
    }
    await fs.remove(tempDir);
  });

  it('cancels an active scan job and persists the status', async () => {
    let resolveScan: ((value: unknown) => void) | undefined;
    const scanService = {
      scanDirectory: jest.fn(
        (_rootPath: string, options: { signal?: AbortSignal }) =>
          new Promise((resolve, reject) => {
            resolveScan = resolve;
            options.signal?.addEventListener('abort', () => {
              reject(new Error('Scan cancelled'));
            });
          }),
      ),
    };
    const service = new ScanJobsService(scanService as never);

    const job = service.startScan('/tmp/books');
    const cancelled = service.cancelJob(job.id);
    resolveScan?.({
      success: true,
      message: 'done',
    });
    await Promise.resolve();

    expect(cancelled.phase).toBe('cancelled');
    expect(service.getJob(job.id).phase).toBe('cancelled');
    expect(await fs.readJson(scanJobsFile)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: job.id,
          phase: 'cancelled',
        }),
      ]),
    );
  });

  it('marks persisted active jobs as failed after a restart', async () => {
    await fs.outputJson(scanJobsFile, [
      {
        id: 'job-1',
        phase: 'scanning',
        success: false,
        message: 'Scanning',
        booksTotal: 1,
        booksScanned: 0,
        chaptersScanned: 0,
        skippedBooks: 0,
        startedAt: '2026-06-30T00:00:00.000Z',
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    ]);

    const service = new ScanJobsService({} as never);

    expect(service.getJob('job-1')).toMatchObject({
      phase: 'failed',
      success: false,
      message: 'Server restarted before this scan finished',
    });
  });
});
