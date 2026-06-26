import { Body, Controller, Get, Post, Put, Res } from '@nestjs/common';
import type {
  AiChatRequest,
  AiChatStreamEvent,
  AiRuntimeConfig,
} from '@juejin-flow/shared';
import type { Response } from 'express';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  chat(@Body() request: AiChatRequest) {
    return this.aiService.chat(request);
  }

  @Get('config')
  getConfig() {
    return this.aiService.getConfig();
  }

  @Put('config')
  updateConfig(@Body() config: AiRuntimeConfig) {
    return this.aiService.updateConfig(config);
  }

  @Post('chat/stream')
  async streamChat(@Body() request: AiChatRequest, @Res() response: Response) {
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders?.();

    const writeEvent = (event: AiChatStreamEvent) => {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      for await (const event of this.aiService.streamChat(request)) {
        writeEvent(event);
      }
    } catch (error) {
      writeEvent({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'AI stream request failed',
      });
    } finally {
      response.end();
    }
  }
}
