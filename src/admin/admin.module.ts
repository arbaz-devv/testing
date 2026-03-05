import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminController } from './admin.controller';
import { AdminAuthController } from './admin-auth.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AdminAuthService } from './admin-auth.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AdminController, AdminAuthController],
  providers: [AdminGuard, AdminService, AdminAuthService],
  exports: [AdminService, AdminAuthService],
})
export class AdminModule {}
