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
      const messageValue =
        typeof body === 'object' && body !== null && 'message' in body
          ? (body as { message: string | string[] }).message
          : exception.message;
      const errors =
        typeof body === 'object' && body !== null && 'errors' in body
          ? (body as { errors: unknown }).errors
          : undefined;
      result = {
        statusCode: status,
        message: Array.isArray(messageValue) ? messageValue[0] : messageValue,
        errors,
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
