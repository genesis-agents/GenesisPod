/**
 * RadarMissionQueryService — Canonical view input aggregator for radar（B7-2）
 *
 * 落地依据：thinning plan §B7-2 / §6.5.1 rule 3.
 */

import { ForbiddenException, Injectable } from "@nestjs/common";

import { RadarMissionStore } from "../lifecycle/radar-mission-store.service";

export interface RadarMissionQueryInputs {
  mode: "row-loaded";
  missionId: string;
  row: NonNullable<Awaited<ReturnType<RadarMissionStore["getById"]>>>;
}

@Injectable()
export class RadarMissionQueryService {
  constructor(private readonly store: RadarMissionStore) {}

  async loadInputs(
    missionId: string,
    userId: string | undefined,
  ): Promise<RadarMissionQueryInputs> {
    if (!userId) {
      throw new ForbiddenException("Authentication required");
    }
    const row = await this.store.getById(missionId, userId);
    if (!row) {
      throw new ForbiddenException(`run ${missionId} not found`);
    }
    return { mode: "row-loaded", missionId, row };
  }
}
