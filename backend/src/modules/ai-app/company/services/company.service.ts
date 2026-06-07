/**
 * CompanyService — business logic for the "一人公司 OS".
 *
 * Responsibilities:
 *   - getCompany(): aggregate snapshot (profile + hired + teams + workflows);
 *                   auto-creates an empty CompanyProfile if one doesn't exist yet.
 *   - hire():       look up a marketplace listing via MarketplaceCatalogService
 *                   then persist a CompanyHiredAgent row.
 *   - All other operations delegate to CompanyRepository after ownership checks.
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import { CompanyRepository } from "./company.repository";
import { MarketplaceCatalogService } from "./marketplace-catalog.service";
import type {
  CompanyProfile,
  CompanyHiredAgent,
  CompanyTeamWithMembers,
  CompanyWorkflow,
} from "./company.repository";
import type {
  UpdateHiredAgentDto,
  UpdateTeamDto,
  UpdateWorkflowDto,
} from "../api/dto/company.dto";

// ─── snapshot shape ────────────────────────────────────────────────────────────

export interface CompanySnapshot {
  profile: CompanyProfile;
  hired: CompanyHiredAgent[];
  teams: CompanyTeamWithMembers[];
  workflows: CompanyWorkflow[];
}

// ─── service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CompanyService {
  constructor(
    private readonly repo: CompanyRepository,
    private readonly catalogService: MarketplaceCatalogService,
  ) {}

  // ── snapshot ────────────────────────────────────────────────────────────────

  async getCompany(userId: string): Promise<CompanySnapshot> {
    let profile = await this.repo.findProfile(userId);
    if (!profile) {
      profile = await this.repo.upsertProfile(userId, { name: "My Company" });
    }

    const [hired, teams, workflows] = await Promise.all([
      this.repo.findAllHired(userId),
      this.repo.findAllTeams(userId),
      this.repo.findAllWorkflows(userId),
    ]);

    return { profile, hired, teams, workflows };
  }

  // ── hire ────────────────────────────────────────────────────────────────────

  async hire(userId: string, listingId: string): Promise<CompanyHiredAgent> {
    const agents = this.catalogService.getAgents();
    const listing = agents.find((a) => a.id === listingId);
    if (!listing) {
      throw new NotFoundException(
        `Agent listing "${listingId}" not found in marketplace catalog`,
      );
    }

    return this.repo.createHired({
      userId,
      listingId,
      name: listing.name,
      role: listing.role,
      models: [],
      autoFallback: true,
      skillIds: listing.skillIds ?? [],
      toolIds: listing.toolIds ?? [],
    });
  }

  // ── hired agent CRUD ────────────────────────────────────────────────────────

  async updateHired(
    userId: string,
    id: string,
    dto: UpdateHiredAgentDto,
  ): Promise<CompanyHiredAgent> {
    const updated = await this.repo.updateHired(id, userId, dto);
    if (!updated) {
      throw new NotFoundException(`HiredAgent "${id}" not found`);
    }
    return updated;
  }

  async deleteHired(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.deleteHired(id, userId);
    if (!deleted) {
      throw new NotFoundException(`HiredAgent "${id}" not found`);
    }
  }

  // ── CEO ─────────────────────────────────────────────────────────────────────

  async setCeo(
    userId: string,
    hiredAgentId: string | null,
  ): Promise<CompanyProfile> {
    if (hiredAgentId !== null) {
      const agent = await this.repo.findHiredById(hiredAgentId, userId);
      if (!agent) {
        throw new NotFoundException(`HiredAgent "${hiredAgentId}" not found`);
      }
    }
    return this.repo.setCeo(userId, hiredAgentId);
  }

  // ── teams ────────────────────────────────────────────────────────────────────

  async createTeam(
    userId: string,
    name: string,
  ): Promise<CompanyTeamWithMembers> {
    return this.repo.createTeam(userId, name);
  }

  async updateTeam(
    userId: string,
    id: string,
    dto: UpdateTeamDto,
  ): Promise<CompanyTeamWithMembers> {
    const updated = await this.repo.updateTeam(id, userId, dto);
    if (!updated) {
      throw new NotFoundException(`Team "${id}" not found`);
    }
    return updated;
  }

  async deleteTeam(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.deleteTeam(id, userId);
    if (!deleted) {
      throw new NotFoundException(`Team "${id}" not found`);
    }
  }

  async addTeamMember(
    userId: string,
    teamId: string,
    hiredAgentId: string,
  ): Promise<CompanyTeamWithMembers> {
    const team = await this.repo.findTeamById(teamId, userId);
    if (!team) {
      throw new NotFoundException(`Team "${teamId}" not found`);
    }
    const agent = await this.repo.findHiredById(hiredAgentId, userId);
    if (!agent) {
      throw new NotFoundException(`HiredAgent "${hiredAgentId}" not found`);
    }
    await this.repo.addTeamMember(teamId, hiredAgentId);
    const refreshed = await this.repo.findTeamById(teamId, userId);
    return refreshed!;
  }

  async removeTeamMember(
    userId: string,
    teamId: string,
    hiredAgentId: string,
  ): Promise<CompanyTeamWithMembers> {
    const team = await this.repo.findTeamById(teamId, userId);
    if (!team) {
      throw new NotFoundException(`Team "${teamId}" not found`);
    }
    await this.repo.removeTeamMember(teamId, hiredAgentId);
    const refreshed = await this.repo.findTeamById(teamId, userId);
    return refreshed!;
  }

  async setTeamLeader(
    userId: string,
    teamId: string,
    hiredAgentId: string,
  ): Promise<CompanyTeamWithMembers> {
    const team = await this.repo.findTeamById(teamId, userId);
    if (!team) {
      throw new NotFoundException(`Team "${teamId}" not found`);
    }
    const agent = await this.repo.findHiredById(hiredAgentId, userId);
    if (!agent) {
      throw new NotFoundException(`HiredAgent "${hiredAgentId}" not found`);
    }
    const updated = await this.repo.updateTeam(teamId, userId, {
      leaderId: hiredAgentId,
    });
    return updated!;
  }

  async setTeamWorkflow(
    userId: string,
    teamId: string,
    workflowId: string | null,
  ): Promise<CompanyTeamWithMembers> {
    const team = await this.repo.findTeamById(teamId, userId);
    if (!team) {
      throw new NotFoundException(`Team "${teamId}" not found`);
    }
    if (workflowId !== null) {
      const wf = await this.repo.findWorkflowById(workflowId, userId);
      if (!wf) {
        throw new NotFoundException(`Workflow "${workflowId}" not found`);
      }
    }
    const updated = await this.repo.updateTeam(teamId, userId, {
      workflowId,
    });
    return updated!;
  }

  // ── workflows ────────────────────────────────────────────────────────────────

  async createCustomWorkflow(userId: string): Promise<CompanyWorkflow> {
    return this.repo.createWorkflow({
      userId,
      name: "新工作流",
      category: "自建",
      stages: ["规划", "执行", "评审"],
      teamSize: 3,
      roles: ["Leader", "成员"],
      origin: "custom",
    });
  }

  async acquireWorkflow(
    userId: string,
    sourceListingId: string,
  ): Promise<CompanyWorkflow> {
    const workflows = this.catalogService.getWorkflows();
    const listing = workflows.find((w) => w.id === sourceListingId);
    if (!listing) {
      throw new NotFoundException(
        `Workflow listing "${sourceListingId}" not found in marketplace catalog`,
      );
    }

    return this.repo.createWorkflow({
      userId,
      name: listing.name,
      category: listing.category,
      stages: listing.stages,
      teamSize: listing.teamSize,
      roles: listing.roles,
      origin: "marketplace",
      sourceListingId,
    });
  }

  async updateWorkflow(
    userId: string,
    id: string,
    dto: UpdateWorkflowDto,
  ): Promise<CompanyWorkflow> {
    const updated = await this.repo.updateWorkflow(id, userId, dto);
    if (!updated) {
      throw new NotFoundException(`Workflow "${id}" not found`);
    }
    return updated;
  }

  async deleteWorkflow(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.deleteWorkflow(id, userId);
    if (!deleted) {
      throw new NotFoundException(`Workflow "${id}" not found`);
    }
  }
}
