import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { NarrativeController } from "../narrative.controller";
import { NarrativeService } from "../../services/briefing/narrative.service";

describe("NarrativeController.getNarrative", () => {
  let controller: NarrativeController;
  let svc: { getNarrativeThread: jest.Mock };

  beforeEach(async () => {
    svc = { getNarrativeThread: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [NarrativeController],
      providers: [{ provide: NarrativeService, useValue: svc }],
    }).compile();
    controller = moduleRef.get(NarrativeController);
  });

  it("throws NotFoundException when service returns null", async () => {
    svc.getNarrativeThread.mockResolvedValueOnce(null);
    await expect(
      controller.getNarrative("topic-1", "narr-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
