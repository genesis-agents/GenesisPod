import { ResearchProjectTTSService } from "../research-project-tts.service";
import type { ConfigService } from "@nestjs/config";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function createMockConfigService(elevenLabsKey?: string, googleKey?: string) {
  return {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === "ELEVENLABS_API_KEY") return elevenLabsKey;
      if (key === "GOOGLE_TTS_API_KEY") return googleKey;
      return undefined;
    }),
  } as unknown as jest.Mocked<ConfigService>;
}

function createMockScript() {
  return {
    title: "AI Research Overview",
    script: {
      segments: [
        {
          speaker: "Host1",
          text: "Welcome to our AI research podcast.",
          emotion: "excited",
        },
        {
          speaker: "Host2",
          text: "Today we explore large language models.",
          emotion: "thoughtful",
        },
      ],
      estimatedDuration: "5 minutes",
    },
  };
}

describe("ResearchProjectTTSService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("isAvailable", () => {
    it("should return true when ElevenLabs key is set", () => {
      const service = new ResearchProjectTTSService(
        createMockConfigService("el-api-key") as unknown as ConfigService,
      );
      expect(service.isAvailable()).toBe(true);
    });

    it("should return true when Google TTS key is set", () => {
      const service = new ResearchProjectTTSService(
        createMockConfigService(
          undefined,
          "google-api-key",
        ) as unknown as ConfigService,
      );
      expect(service.isAvailable()).toBe(true);
    });

    it("should return false when no keys are configured", () => {
      const service = new ResearchProjectTTSService(
        createMockConfigService() as unknown as ConfigService,
      );
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe("getProvider", () => {
    it("should return elevenlabs when ElevenLabs key is set", () => {
      const service = new ResearchProjectTTSService(
        createMockConfigService("el-key") as unknown as ConfigService,
      );
      expect(service.getProvider()).toBe("elevenlabs");
    });

    it("should return google when only Google key is set", () => {
      const service = new ResearchProjectTTSService(
        createMockConfigService(
          undefined,
          "goog-key",
        ) as unknown as ConfigService,
      );
      expect(service.getProvider()).toBe("google");
    });

    it("should return none when no keys are set", () => {
      const service = new ResearchProjectTTSService(
        createMockConfigService() as unknown as ConfigService,
      );
      expect(service.getProvider()).toBe("none");
    });

    it("should prefer ElevenLabs over Google when both are set", () => {
      const service = new ResearchProjectTTSService(
        createMockConfigService(
          "el-key",
          "goog-key",
        ) as unknown as ConfigService,
      );
      expect(service.getProvider()).toBe("elevenlabs");
    });
  });

  describe("generateAudio - no provider", () => {
    it("should return null when no TTS provider is configured", async () => {
      const service = new ResearchProjectTTSService(
        createMockConfigService() as unknown as ConfigService,
      );

      const result = await service.generateAudio(createMockScript());
      expect(result).toBeNull();
    });
  });

  describe("generateAudio - ElevenLabs", () => {
    let service: ResearchProjectTTSService;

    beforeEach(() => {
      service = new ResearchProjectTTSService(
        createMockConfigService("el-api-key-test") as unknown as ConfigService,
      );
    });

    it("should generate audio using ElevenLabs and return base64 URL", async () => {
      const audioData = Buffer.from("fake-mp3-data");
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(audioData.buffer),
      });

      const result = await service.generateAudio(createMockScript());

      expect(result).not.toBeNull();
      expect(result?.audioUrl).toMatch(/^data:audio\/mpeg;base64,/);
      expect(result?.duration).toBeGreaterThan(0);
      expect(mockFetch).toHaveBeenCalledTimes(2); // 2 segments
    });

    it("should call ElevenLabs API with correct headers", async () => {
      const audioData = Buffer.from("audio");
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(audioData.buffer),
      });

      await service.generateAudio(createMockScript());

      const firstCall = mockFetch.mock.calls[0];
      expect(firstCall[0]).toContain("api.elevenlabs.io");
      expect(firstCall[1].headers["xi-api-key"]).toBe("el-api-key-test");
    });

    it("should propagate error when ElevenLabs API returns error status", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
      });

      // generateAudio returns the promise without awaiting, so errors propagate
      await expect(service.generateAudio(createMockScript())).rejects.toThrow(
        "ElevenLabs API error: 429",
      );
    });

    it("should handle excited emotion segment", async () => {
      const audioData = Buffer.from("audio");
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(audioData.buffer),
      });

      const scriptWithEmotions = {
        ...createMockScript(),
        script: {
          segments: [
            {
              speaker: "Host1",
              text: "Amazing discovery!",
              emotion: "excited",
            },
          ],
          estimatedDuration: "1 min",
        },
      };

      await service.generateAudio(scriptWithEmotions);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.voice_settings.style).toBe(0.8); // excited style
    });

    it("should handle thoughtful emotion segment", async () => {
      const audioData = Buffer.from("audio");
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(audioData.buffer),
      });

      const scriptWithThoughtful = {
        ...createMockScript(),
        script: {
          segments: [
            {
              speaker: "Host1",
              text: "Consider this carefully.",
              emotion: "thoughtful",
            },
          ],
          estimatedDuration: "1 min",
        },
      };

      await service.generateAudio(scriptWithThoughtful);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.voice_settings.style).toBe(0.3); // thoughtful style
    });

    it("should use default style for unknown emotion", async () => {
      const audioData = Buffer.from("audio");
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(audioData.buffer),
      });

      const scriptUnknownEmotion = {
        ...createMockScript(),
        script: {
          segments: [
            {
              speaker: "Host1",
              text: "Neutral statement.",
              emotion: "neutral",
            },
          ],
          estimatedDuration: "1 min",
        },
      };

      await service.generateAudio(scriptUnknownEmotion);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.voice_settings.style).toBe(0.5); // default style
    });
  });

  describe("generateAudio - Google TTS", () => {
    let service: ResearchProjectTTSService;

    beforeEach(() => {
      service = new ResearchProjectTTSService(
        createMockConfigService(
          undefined,
          "google-tts-key",
        ) as unknown as ConfigService,
      );
    });

    it("should generate audio using Google TTS", async () => {
      const audioBase64 = Buffer.from("fake-mp3").toString("base64");
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ audioContent: audioBase64 }),
      });

      const result = await service.generateAudio(createMockScript());

      expect(result).not.toBeNull();
      expect(result?.audioUrl).toMatch(/^data:audio\/mpeg;base64,/);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should call Google TTS API with correct URL containing API key", async () => {
      const audioBase64 = Buffer.from("audio").toString("base64");
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ audioContent: audioBase64 }),
      });

      await service.generateAudio(createMockScript());

      const firstCall = mockFetch.mock.calls[0];
      expect(firstCall[0]).toContain("texttospeech.googleapis.com");
      expect(firstCall[0]).toContain("google-tts-key");
    });

    it("should propagate error when Google TTS API returns error status", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403 });

      // generateAudio returns the promise without awaiting, so errors propagate
      await expect(service.generateAudio(createMockScript())).rejects.toThrow(
        "Google TTS API error: 403",
      );
    });

    it("should use Host2 voice for Host2 speaker", async () => {
      const audioBase64 = Buffer.from("audio").toString("base64");
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ audioContent: audioBase64 }),
      });

      const scriptHost2 = {
        ...createMockScript(),
        script: {
          segments: [{ speaker: "Host2", text: "Hello from host 2" }],
          estimatedDuration: "1 min",
        },
      };

      await service.generateAudio(scriptHost2);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.voice.name).toBe("en-US-Neural2-F");
    });
  });

  describe("parseScript", () => {
    let service: ResearchProjectTTSService;

    beforeEach(() => {
      service = new ResearchProjectTTSService(
        createMockConfigService() as unknown as ConfigService,
      );
    });

    it("should parse valid script JSON", () => {
      const script = createMockScript();
      const jsonContent = JSON.stringify(script);

      const result = service.parseScript(jsonContent);

      expect(result).not.toBeNull();
      expect(result?.title).toBe("AI Research Overview");
      expect(result?.script.segments).toHaveLength(2);
    });

    it("should return null for invalid JSON", () => {
      const result = service.parseScript("{ invalid json }");
      expect(result).toBeNull();
    });

    it("should return null when script structure is missing", () => {
      const invalidScript = JSON.stringify({ title: "No script key" });
      const result = service.parseScript(invalidScript);
      expect(result).toBeNull();
    });

    it("should return null when segments is not an array", () => {
      const invalidScript = JSON.stringify({
        title: "Bad Script",
        script: { segments: "not-an-array" },
      });
      const result = service.parseScript(invalidScript);
      expect(result).toBeNull();
    });

    it("should handle empty string input", () => {
      const result = service.parseScript("");
      expect(result).toBeNull();
    });

    it("should parse script with multiple segments", () => {
      const bigScript = {
        title: "Long Episode",
        script: {
          segments: Array.from({ length: 10 }, (_, i) => ({
            speaker: i % 2 === 0 ? "Host1" : "Host2",
            text: `Segment ${i + 1} text`,
          })),
          estimatedDuration: "30 min",
        },
      };

      const result = service.parseScript(JSON.stringify(bigScript));

      expect(result?.script.segments).toHaveLength(10);
    });
  });
});
