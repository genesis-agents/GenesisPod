import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EmailService } from "./email.service";
import { EmailNotificationPresetsService } from "./presets/email-notification-presets.service";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [EmailService, EmailNotificationPresetsService],
  exports: [EmailService, EmailNotificationPresetsService],
})
export class EmailModule {}
