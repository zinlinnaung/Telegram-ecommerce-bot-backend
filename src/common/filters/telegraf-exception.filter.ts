import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { TelegrafArgumentsHost } from 'nestjs-telegraf';
import { Context } from 'telegraf';

@Catch()
export class TelegrafExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(TelegrafExceptionFilter.name);

  async catch(exception: Error, host: ArgumentsHost): Promise<void> {
    const telegrafHost = TelegrafArgumentsHost.create(host);
    const ctx = telegrafHost.getContext<Context>();

    this.logger.error(
      `Error in bot interaction: ${exception.message}`,
      exception.stack,
    );

    // Only reply if we have a valid context (not valid for some update types)
    if (ctx && ctx.reply) {
      await ctx.reply(
        '⚠️ An error occurred while processing your request. Please try again later.',
      );
    }
  }
}
