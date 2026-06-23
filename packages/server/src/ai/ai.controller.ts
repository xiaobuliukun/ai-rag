import { Body, Controller, Post } from '@nestjs/common';
import type { AiChatRequest } from '@juejin-flow/shared';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  chat(@Body() request: AiChatRequest) {
    return this.aiService.chat(request);
  }
}
