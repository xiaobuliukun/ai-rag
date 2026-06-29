import { Injectable } from '@nestjs/common';

export type AppStatus = {
  name: string;
  status: 'ok';
  apiPrefix: string;
  features: string[];
};

@Injectable()
export class AppService {
  getStatus(): AppStatus {
    return {
      name: '墨序',
      status: 'ok',
      apiPrefix: 'api',
      features: ['library-scan', 'full-text-search', 'bookmarks', 'local-rag'],
    };
  }
}
