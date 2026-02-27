import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { handleError } from './errors';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let result: {
      statusCode: number;
      message: string;
      code?: string;
      errors?: unknown;
    };
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'object' && body !== null && 'message' in body
          ? (body as { message: string | string[] }).message
          : exception.message;
      result = {
        statusCode: status,
        message: Array.isArray(message) ? message[0] : message,
      };
    } else {
      result = handleError(exception);
    }

    response
      .status(result.statusCode)
      .json(
        result.errors !== undefined
          ? { error: result.message, errors: result.errors }
          : { error: result.message },
      );
  }
}
