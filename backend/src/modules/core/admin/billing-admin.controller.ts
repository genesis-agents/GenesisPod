import { Controller, Get, UseGuards, Logger } from "@nestjs/common";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../common/guards/admin.guard";
import { BillingService } from "./services/billing.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class BillingAdminController {
  private readonly logger = new Logger(BillingAdminController.name);

  constructor(private billingService: BillingService) {}

  @Get("billing/overview")
  async getBillingOverview() {
    this.logger.log("Admin: Fetching billing overview");
    return this.billingService.getBillingOverview();
  }
}
