import { Test, TestingModule } from '@nestjs/testing';
import { PromptTemplateService } from '../prompt-template.service';
import { PrismaService } from '../../../../common/prisma/prisma.service';

describe('PromptTemplateService', () => {
  let service: PromptTemplateService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromptTemplateService,
        {
          provide: PrismaService,
          useValue: {
            promptTemplate: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PromptTemplateService>(PromptTemplateService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('renderTemplate', () => {
    it('should render template with double curly braces', () => {
      const template = 'Hello, {{name}}! Today is {{date}}.';
      const variables = { name: 'World', date: '2025-01-24' };
      const result = service.renderTemplate(template, variables);
      expect(result).toBe('Hello, World! Today is 2025-01-24.');
    });

    it('should render template with dollar sign format', () => {
      const template = 'Hello, ${name}! Today is ${date}.';
      const variables = { name: 'World', date: '2025-01-24' };
      const result = service.renderTemplate(template, variables);
      expect(result).toBe('Hello, World! Today is 2025-01-24.');
    });

    it('should handle missing variables gracefully', () => {
      const template = 'Hello, {{name}}!';
      const variables = {};
      const result = service.renderTemplate(template, variables);
      // Missing variables remain unchanged
      expect(result).toBe('Hello, {{name}}!');
    });

    it('should handle null values', () => {
      const template = 'Value: {{value}}';
      const variables = { value: null };
      const result = service.renderTemplate(template, variables);
      expect(result).toBe('Value: ');
    });

    it('should handle undefined values', () => {
      const template = 'Value: {{value}}';
      const variables = { value: undefined };
      const result = service.renderTemplate(template, variables);
      expect(result).toBe('Value: ');
    });

    it('should handle multiple occurrences of same variable', () => {
      const template = '{{name}} said: "{{name}} is here!"';
      const variables = { name: 'Alice' };
      const result = service.renderTemplate(template, variables);
      expect(result).toBe('Alice said: "Alice is here!"');
    });

    it('should handle whitespace in variable names', () => {
      const template = 'Value: {{ name }} and {{  date  }}';
      const variables = { name: 'Test', date: '2025' };
      const result = service.renderTemplate(template, variables);
      expect(result).toBe('Value: Test and 2025');
    });
  });

  describe('getPrompt', () => {
    it('should return active template from cache', async () => {
      const mockTemplate = {
        id: 'test-id',
        taskType: 'TEST',
        name: 'Test Template',
        version: 1,
        template: 'Test {{input}}',
        variables: ['input'],
        isActive: true,
        description: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.promptTemplate, 'findMany').mockResolvedValue([mockTemplate]);

      const result = await service.getPrompt('TEST');

      expect(result).toBeDefined();
      expect(result?.taskType).toBe('TEST');
      expect(result?.version).toBe(1);
    });

    it('should return specific version when version is provided', async () => {
      const mockTemplate = {
        id: 'test-id',
        taskType: 'TEST',
        name: 'Test Template',
        version: 2,
        template: 'Test {{input}}',
        variables: ['input'],
        isActive: false,
        description: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.promptTemplate, 'findUnique').mockResolvedValue(mockTemplate);

      const result = await service.getPrompt('TEST', 2);

      expect(result).toBeDefined();
      expect(result?.version).toBe(2);
      expect(prisma.promptTemplate.findUnique).toHaveBeenCalledWith({
        where: {
          taskType_version: {
            taskType: 'TEST',
            version: 2,
          },
        },
      });
    });
  });

  describe('createVersion', () => {
    it('should create first version', async () => {
      jest.spyOn(prisma.promptTemplate, 'findFirst').mockResolvedValue(null);

      const mockCreated = {
        id: 'test-id',
        taskType: 'NEW',
        name: 'New Template',
        version: 1,
        template: 'Template {{var}}',
        variables: ['var'],
        isActive: false,
        description: 'Test description',
        createdBy: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.promptTemplate, 'create').mockResolvedValue(mockCreated);

      const result = await service.createVersion({
        taskType: 'NEW',
        name: 'New Template',
        template: 'Template {{var}}',
        variables: ['var'],
        description: 'Test description',
        createdBy: 'admin',
      });

      expect(result.version).toBe(1);
      expect(prisma.promptTemplate.create).toHaveBeenCalled();
    });

    it('should increment version number', async () => {
      jest.spyOn(prisma.promptTemplate, 'findFirst').mockResolvedValue({
        version: 3,
      } as any);

      const mockCreated = {
        id: 'test-id',
        taskType: 'EXISTING',
        name: 'Existing Template',
        version: 4,
        template: 'Template {{var}}',
        variables: ['var'],
        isActive: false,
        description: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.promptTemplate, 'create').mockResolvedValue(mockCreated);

      const result = await service.createVersion({
        taskType: 'EXISTING',
        name: 'Existing Template',
        template: 'Template {{var}}',
      });

      expect(result.version).toBe(4);
    });
  });
});
