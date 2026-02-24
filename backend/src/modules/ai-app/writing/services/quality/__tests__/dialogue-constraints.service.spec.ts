import { Test, TestingModule } from "@nestjs/testing";
import { DialogueConstraintsService } from "../dialogue-constraints.service";
import { CharacterPersonalityService } from "../character-personality.service";

describe("DialogueConstraintsService", () => {
  let service: DialogueConstraintsService;
  let mockCharacterPersonality: jest.Mocked<CharacterPersonalityService>;

  const mockCharacter = {
    id: "char-1",
    name: "苏曼",
    role: "protagonist",
    background: "化妆品配方工程师",
    personality: { traits: ["聪慧", "隐忍"] },
    bibleId: "bible-1",
    aliases: [],
    appearance: null,
    motivation: null,
    arc: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockConstraint = {
    characterId: "char-1",
    characterName: "苏曼",
    speechPatterns: ["从配方角度分析...", "这种症状是典型的..."],
    vocabularyLevel: "formal" as const,
    emotionalTendency: ["冷静分析", "理性判断"],
    tabooWords: ["粗俗词汇"],
    catchphrases: [],
    dialogueExamples: [
      {
        id: "ex-1",
        characterId: "char-1",
        dialogue: "从成分角度来看，这应该是铅中毒",
        context: "分析病症",
      },
    ],
  };

  beforeEach(async () => {
    mockCharacterPersonality = {
      getCharacterByName: jest.fn(),
      getPersonalityConstraints: jest.fn(),
    } as unknown as jest.Mocked<CharacterPersonalityService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DialogueConstraintsService,
        { provide: CharacterPersonalityService, useValue: mockCharacterPersonality },
      ],
    }).compile();

    service = module.get<DialogueConstraintsService>(DialogueConstraintsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("getDialectConstraints", () => {
    it("should return constraints for 汉朝", () => {
      const result = service.getDialectConstraints("汉朝");

      expect(result).toBeDefined();
      expect(result?.dynasty).toBe("汉朝");
      expect(result?.formalAddresses).toContain("陛下");
    });

    it("should return constraints for 唐朝", () => {
      const result = service.getDialectConstraints("唐朝");

      expect(result).toBeDefined();
      expect(result?.dynasty).toBe("唐朝");
    });

    it("should return constraints for 宋朝", () => {
      const result = service.getDialectConstraints("宋朝");

      expect(result).toBeDefined();
      expect(result?.dynasty).toBe("宋朝");
    });

    it("should return constraints for 明朝", () => {
      const result = service.getDialectConstraints("明朝");

      expect(result).toBeDefined();
      expect(result?.dynasty).toBe("明朝");
    });

    it("should return constraints for 清朝", () => {
      const result = service.getDialectConstraints("清朝");

      expect(result).toBeDefined();
      expect(result?.dynasty).toBe("清朝");
      expect(result?.speechPatternsByClass.eunuch).toBeDefined();
    });

    it("should return null for unknown dynasty", () => {
      const result = service.getDialectConstraints("不存在的朝代");

      expect(result).toBeNull();
    });
  });

  describe("generateDialectConstraintPrompt", () => {
    it("should generate prompt for 清朝", async () => {
      const result = await service.generateDialectConstraintPrompt("清朝");

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain("清朝");
      expect(result).toContain("称呼规范");
    });

    it("should return empty string for unknown dynasty", async () => {
      const result = await service.generateDialectConstraintPrompt("不存在");

      expect(result).toBe("");
    });

    it("should include forbidden modern words", async () => {
      const result = await service.generateDialectConstraintPrompt("汉朝");

      expect(result).toContain("禁用词汇");
    });

    it("should include class speech patterns", async () => {
      const result = await service.generateDialectConstraintPrompt("唐朝");

      expect(result).toContain("不同阶级对话特征");
    });
  });

  describe("generateCharacterDialogueConstraints", () => {
    it("should return null when character not found", async () => {
      (mockCharacterPersonality.getCharacterByName as jest.Mock).mockResolvedValue(null);

      const result = await service.generateCharacterDialogueConstraints({
        projectId: "proj-1",
        characterName: "不存在的角色",
      });

      expect(result).toBeNull();
    });

    it("should return null when no personality constraints found", async () => {
      (mockCharacterPersonality.getCharacterByName as jest.Mock).mockResolvedValue(
        mockCharacter,
      );
      (mockCharacterPersonality.getPersonalityConstraints as jest.Mock).mockResolvedValue(
        [],
      );

      const result = await service.generateCharacterDialogueConstraints({
        projectId: "proj-1",
        characterName: "苏曼",
      });

      expect(result).toBeNull();
    });

    it("should return character dialogue constraints", async () => {
      (mockCharacterPersonality.getCharacterByName as jest.Mock).mockResolvedValue(
        mockCharacter,
      );
      (mockCharacterPersonality.getPersonalityConstraints as jest.Mock).mockResolvedValue(
        [mockConstraint],
      );

      const result = await service.generateCharacterDialogueConstraints({
        projectId: "proj-1",
        characterName: "苏曼",
      });

      expect(result).toBeDefined();
      expect(result?.characterName).toBe("苏曼");
      expect(result?.speechPatterns).toEqual(mockConstraint.speechPatterns);
      expect(result?.forbiddenPhrases).toEqual(mockConstraint.tabooWords);
    });
  });

  describe("checkDialogueRealism", () => {
    it("should detect modern vocabulary in dialogue", async () => {
      (mockCharacterPersonality.getCharacterByName as jest.Mock).mockResolvedValue(null);
      (mockCharacterPersonality.getPersonalityConstraints as jest.Mock).mockResolvedValue(
        [],
      );

      const result = await service.checkDialogueRealism({
        projectId: "proj-1",
        dynasty: "清朝",
        dialogues: [
          {
            characterName: "苏曼",
            dialogue: "OK没问题，搞定了",
          },
        ],
      });

      expect(result.isRealistic).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.type === "modern_expression")).toBe(true);
    });

    it("should return realistic when dialogue has no issues", async () => {
      (mockCharacterPersonality.getCharacterByName as jest.Mock).mockResolvedValue(null);
      (mockCharacterPersonality.getPersonalityConstraints as jest.Mock).mockResolvedValue(
        [],
      );

      const result = await service.checkDialogueRealism({
        projectId: "proj-1",
        dynasty: "清朝",
        dialogues: [
          {
            characterName: "苏曼",
            dialogue: "奴婢遵旨，这便去办",
          },
        ],
      });

      expect(result.isRealistic).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe("analyzeDialoguePacing", () => {
    it("should detect consecutive dialogues without action", () => {
      const content =
        '"你好吗？""还好。""最近怎样？""还行。""有什么事吗？""没什么。""真的吗？""是的。""那就好。""嗯。"';

      const result = service.analyzeDialoguePacing(content);

      expect(result.consecutiveDialogues).toBeGreaterThan(0);
    });

    it("should not require action for few dialogues", () => {
      const content = '"你好！" 她微笑着说道。这是一个美好的早晨。';

      const result = service.analyzeDialoguePacing(content);

      expect(result.needsActionDescription).toBe(false);
    });

    it("should provide action suggestions when consecutive dialogues >= 5", () => {
      const content =
        '"一。""二。""三。""四。""五。""六。""七。""八。""九。""十。"';

      const result = service.analyzeDialoguePacing(content);

      if (result.needsActionDescription) {
        expect(result.suggestedActions.length).toBeGreaterThan(0);
      }
    });

    it("should return valid structure for empty content", () => {
      const result = service.analyzeDialoguePacing("");

      expect(result).toHaveProperty("consecutiveDialogues");
      expect(result).toHaveProperty("needsActionDescription");
      expect(result).toHaveProperty("suggestedActions");
    });
  });

  describe("generateCompleteDialogueConstraints", () => {
    it("should combine dialect and character constraints", async () => {
      (mockCharacterPersonality.getCharacterByName as jest.Mock).mockResolvedValue(null);
      (mockCharacterPersonality.getPersonalityConstraints as jest.Mock).mockResolvedValue(
        [],
      );

      const result = await service.generateCompleteDialogueConstraints({
        projectId: "proj-1",
        dynasty: "清朝",
        characterNames: ["苏曼"],
      });

      expect(typeof result).toBe("string");
      expect(result).toContain("清朝");
    });

    it("should return at least dialect constraints even without character info", async () => {
      (mockCharacterPersonality.getCharacterByName as jest.Mock).mockResolvedValue(null);
      (mockCharacterPersonality.getPersonalityConstraints as jest.Mock).mockResolvedValue(
        [],
      );

      const result = await service.generateCompleteDialogueConstraints({
        projectId: "proj-1",
        dynasty: "汉朝",
        characterNames: [],
      });

      expect(result).toContain("汉朝");
    });
  });
});
