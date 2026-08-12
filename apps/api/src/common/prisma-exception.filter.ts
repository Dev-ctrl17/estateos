import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";

interface HttpResponseBody {
  status(code: number): {
    json(data: any): void;
  };
}

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientRustPanicError,
  Prisma.PrismaClientUnknownRequestError
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpResponseBody>();

    this.logger.error(
      `Prisma Error: ${exception.code || exception.message}`,
      exception.stack
    );

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "A database error occurred.";

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2021") {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = "Database tables have not been created yet. Please run 'npx prisma db push' on your database.";
      } else if (exception.code === "P2002") {
        status = HttpStatus.CONFLICT;
        message = `Unique constraint failed on field: ${((exception.meta?.target) as string[])?.join(", ") || "record"}`;
      } else if (exception.code === "P2025") {
        status = HttpStatus.NOT_FOUND;
        message = "Requested database record was not found.";
      } else {
        message = `Database query error (${exception.code}): ${exception.message}`;
      }
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = "Failed to connect to the database. Please check your DATABASE_URL and SSL mode.";
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: exception.code || "DatabaseError",
      timestamp: new Date().toISOString(),
    });
  }
}
