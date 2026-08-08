import {
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssetsController } from './assets.controller';

describe('AssetsController', () => {
  let tempDirectory: string;
  let bookDirectory: string;
  const prisma = {
    book: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tempDirectory = mkdtempSync(join(tmpdir(), 'moxu-assets-'));
    bookDirectory = join(tempDirectory, 'book');
    mkdirSync(bookDirectory);
    prisma.book.findUnique.mockResolvedValue({ path: bookDirectory });
  });

  afterEach(() => {
    rmSync(tempDirectory, { recursive: true, force: true });
  });

  it('serves an allowed image with hardened response headers', async () => {
    const imagePath = join(bookDirectory, 'images', 'cover.png');
    mkdirSync(join(bookDirectory, 'images'));
    writeFileSync(imagePath, 'not-a-real-png');
    const response = createResponse();
    const controller = new AssetsController(prisma as never);

    await controller.serveBookFile(
      'book-1',
      'images/cover.png',
      response as never,
    );

    expect(response.type).toHaveBeenCalledWith('image/png');
    expect(response.sendFile).toHaveBeenCalledWith(realpathSync(imagePath));
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      'nosniff',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      "default-src 'none'; sandbox",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cross-Origin-Resource-Policy',
      'cross-origin',
    );
  });

  it('rejects lexical parent-directory traversal', async () => {
    writeFileSync(join(tempDirectory, 'outside.png'), 'outside');
    const controller = new AssetsController(prisma as never);

    await expect(
      controller.serveBookFile(
        'book-1',
        '../outside.png',
        createResponse() as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a symlink that resolves outside the book directory', async () => {
    const outsidePath = join(tempDirectory, 'outside.png');
    writeFileSync(outsidePath, 'outside');
    symlinkSync(outsidePath, join(bookDirectory, 'leak.png'));
    const controller = new AssetsController(prisma as never);

    await expect(
      controller.serveBookFile('book-1', 'leak.png', createResponse() as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects active document types even when they are inside the book', async () => {
    writeFileSync(
      join(bookDirectory, 'page.html'),
      '<script>alert(1)</script>',
    );
    const controller = new AssetsController(prisma as never);

    await expect(
      controller.serveBookFile(
        'book-1',
        'page.html',
        createResponse() as never,
      ),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });
});

function createResponse() {
  return {
    setHeader: jest.fn(),
    type: jest.fn().mockReturnThis(),
    sendFile: jest.fn().mockReturnValue(undefined),
  };
}
