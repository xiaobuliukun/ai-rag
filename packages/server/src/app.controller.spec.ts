import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('status', () => {
    it('returns app status', () => {
      expect(appController.getStatus()).toEqual({
        name: '墨序',
        status: 'ok',
        apiPrefix: 'api',
        features: [
          'library-scan',
          'full-text-search',
          'bookmarks',
          'local-rag',
        ],
      });
    });

    it('returns a lightweight health response', () => {
      expect(appController.getHealth()).toEqual({ status: 'ok' });
    });
  });
});
