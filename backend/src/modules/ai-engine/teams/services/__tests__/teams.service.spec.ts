import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TeamsService, CreateMissionDto } from '../teams.service';
import { TeamFactory } from '../../factory/team-factory';
import { TeamRegistry } from '../../registry/team-registry';
import { RoleRegistry } from '../../registry/role-registry';
import { MissionOrchestrator } from '../../orchestrator/mission-orchestrator';
import { ConstraintEngine } from '../../constraints/constraint-engine';
import { ITeam, TeamConfig, TeamId } from '../../abstractions/team.interface';
import { MissionEvent, MissionResult } from '../../abstractions/mission.interface';

describe('TeamsService', () => {
  let service: TeamsService;
  let teamFactory: jest.Mocked<TeamFactory>;
  let teamRegistry: jest.Mocked<TeamRegistry>;
  let roleRegistry: jest.Mocked<RoleRegistry>;
  let missionOrchestrator: jest.Mocked<MissionOrchestrator>;
  let constraintEngine: jest.Mocked<ConstraintEngine>;

  const mockTeamConfig = {
    id: 'test-team' as TeamId,
    name: 'Test Team',
    description: 'A test team',
    type: 'predefined',
    icon: '🧪',
    color: '#00FF00',
    leaderRoleId: 'leader-role',
    memberRoles: [{ roleId: 'member-role', count: 2 }],
    constraintProfile: {
      cost: { budget: 1.0, modelPreference: 'balanced' },
      quality: { depth: 'standard', accuracy: 'balanced' },
      efficiency: { maxDuration: 300000 },
    },
    deliverableTypes: ['report', 'analysis'],
  } as unknown as TeamConfig;

  const mockTeam = {
    id: 'test-team' as TeamId,
    name: 'Test Team',
    description: 'A test team',
    leaderRoleId: 'leader-role',
    memberRoles: ['member-role'],
    constraintProfile: mockTeamConfig.constraintProfile,
    deliverableTypes: ['report', 'analysis'],
  } as unknown as ITeam;

  beforeEach(async () => {
    const mockTeamFactory = {
      createFromId: jest.fn(),
      createFromConfig: jest.fn(),
    };

    const mockTeamRegistry = {
      has: jest.fn(),
      getConfig: jest.fn(),
      getAllConfigs: jest.fn(),
      register: jest.fn(),
    };

    const mockRoleRegistry = {
      tryGet: jest.fn(),
      get: jest.fn(),
      has: jest.fn(),
    };

    const mockMissionOrchestrator = {
      execute: jest.fn(),
    };

    const mockConstraintEngine = {
      validate: jest.fn(),
      checkCost: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: TeamFactory, useValue: mockTeamFactory },
        { provide: TeamRegistry, useValue: mockTeamRegistry },
        { provide: RoleRegistry, useValue: mockRoleRegistry },
        { provide: MissionOrchestrator, useValue: mockMissionOrchestrator },
        { provide: ConstraintEngine, useValue: mockConstraintEngine },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
    teamFactory = module.get(TeamFactory);
    teamRegistry = module.get(TeamRegistry);
    roleRegistry = module.get(RoleRegistry);
    missionOrchestrator = module.get(MissionOrchestrator);
    constraintEngine = module.get(ConstraintEngine);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listTeams', () => {
    it('should return list of all teams', () => {
      teamRegistry.getAllConfigs.mockReturnValue([mockTeamConfig]);
      roleRegistry.tryGet.mockReturnValue({ name: 'Leader Role' } as any);

      const result = service.listTeams();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'test-team',
        name: 'Test Team',
        type: 'predefined',
      });
      expect(teamRegistry.getAllConfigs).toHaveBeenCalled();
    });

    it('should return empty array when no teams registered', () => {
      teamRegistry.getAllConfigs.mockReturnValue([]);

      const result = service.listTeams();

      expect(result).toEqual([]);
    });

    it('should include capabilities in team info', () => {
      teamRegistry.getAllConfigs.mockReturnValue([mockTeamConfig]);
      roleRegistry.tryGet.mockReturnValue({ name: 'Leader Role' } as any);

      const result = service.listTeams();

      expect(result[0].capabilities).toEqual(['report', 'analysis']);
    });
  });

  describe('getTeam', () => {
    it('should return team by ID', () => {
      teamRegistry.getConfig.mockReturnValue(mockTeamConfig);
      roleRegistry.tryGet.mockReturnValue({ name: 'Leader Role' } as any);

      const result = service.getTeam('test-team' as TeamId);

      expect(result.id).toBe('test-team');
      expect(result.name).toBe('Test Team');
      expect(teamRegistry.getConfig).toHaveBeenCalledWith('test-team');
    });

    it('should throw NotFoundException when team not found', () => {
      teamRegistry.getConfig.mockReturnValue(null as unknown as TeamConfig);

      expect(() => service.getTeam('non-existent' as TeamId)).toThrow(
        NotFoundException,
      );
    });

    it('should include leader and member roles', () => {
      teamRegistry.getConfig.mockReturnValue(mockTeamConfig);
      roleRegistry.tryGet
        .mockReturnValueOnce({ name: 'Leader Role' } as any)
        .mockReturnValueOnce({ name: 'Member Role' } as any);

      const result = service.getTeam('test-team' as TeamId);

      expect(result.leaderRole).toBe('Leader Role');
      expect(result.memberRoles).toContain('Member Role');
    });
  });

  describe('getTeamInstance', () => {
    it('should create and return team instance', () => {
      teamFactory.createFromId.mockReturnValue(mockTeam);

      const result = service.getTeamInstance('test-team' as TeamId);

      expect(result).toBe(mockTeam);
      expect(teamFactory.createFromId).toHaveBeenCalledWith('test-team');
    });
  });

  describe('executeMission', () => {
    const mockDto: CreateMissionDto = {
      teamId: 'test-team' as TeamId,
      goal: 'Complete the task',
      context: 'Additional context',
      userId: 'user-123',
    };

    it('should throw NotFoundException when team not found', async () => {
      teamRegistry.has.mockReturnValue(false);

      await expect(service.executeMission(mockDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for invalid constraints', async () => {
      teamRegistry.has.mockReturnValue(true);
      teamFactory.createFromId.mockReturnValue(mockTeam);
      constraintEngine.validate.mockReturnValue({
        valid: false,
        violations: [{ type: 'cost', message: 'Cost too high' }],
      });

      await expect(
        service.executeMission({
          ...mockDto,
          constraints: { cost: { budget: 999, modelPreference: 'balanced' } } as unknown as CreateMissionDto['constraints'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('executeMissionStream', () => {
    const mockDto: CreateMissionDto = {
      teamId: 'test-team' as TeamId,
      goal: 'Complete the task',
    };

    it('should stream mission events', async () => {
      teamRegistry.has.mockReturnValue(true);
      teamFactory.createFromId.mockReturnValue(mockTeam);

      const now = new Date();
      const mockEvents = [
        { type: 'mission_started', missionId: 'mission-1', timestamp: now, data: {} },
        { type: 'step_started', missionId: 'mission-1', timestamp: now, data: { stepId: 'step-1' } },
        { type: 'step_completed', missionId: 'mission-1', timestamp: now, data: { stepId: 'step-1' } },
        { type: 'mission_completed', missionId: 'mission-1', timestamp: now, data: { result: { success: true } } },
      ] as unknown as MissionEvent[];

      const mockGenerator = (async function* () {
        for (const event of mockEvents) {
          yield event;
        }
      })() as unknown as AsyncGenerator<MissionEvent, MissionResult>;

      missionOrchestrator.execute.mockReturnValue(mockGenerator);

      const events: MissionEvent[] = [];
      for await (const event of service.executeMissionStream(mockDto)) {
        events.push(event);
      }

      expect(events).toHaveLength(4);
      expect(events[0].type).toBe('mission_started');
      expect(events[3].type).toBe('mission_completed');
    });

    it('should throw NotFoundException when team not found', async () => {
      teamRegistry.has.mockReturnValue(false);

      const generator = service.executeMissionStream(mockDto);

      await expect(generator.next()).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMissionStatus', () => {
    it('should throw NotFoundException for unknown mission', () => {
      expect(() => service.getMissionStatus('unknown-id')).toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMissionResult', () => {
    it('should throw NotFoundException for unknown mission', async () => {
      await expect(service.getMissionResult('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('cancelMission', () => {
    it('should throw NotFoundException for unknown mission', () => {
      expect(() => service.cancelMission('unknown-id')).toThrow(
        NotFoundException,
      );
    });
  });
});
