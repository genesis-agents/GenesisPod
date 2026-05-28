import { ConfigService } from "@nestjs/config";
import { InternalServerErrorException, Logger } from "@nestjs/common";
import { EncryptionService } from "../encryption.service";

const buildConfig = (env: Record<string, string | undefined>): ConfigService =>
  ({
    get: (key: string) => env[key],
  }) as unknown as ConfigService;

describe("EncryptionService", () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  describe("constructor", () => {
    it("throws in production when SETTINGS_ENCRYPTION_KEY missing", () => {
      expect(
        () => new EncryptionService(buildConfig({ NODE_ENV: "production" })),
      ).toThrow(InternalServerErrorException);
    });

    it("uses dev fallback key in test/dev", () => {
      expect(
        () => new EncryptionService(buildConfig({ NODE_ENV: "test" })),
      ).not.toThrow();
    });
  });

  describe("encrypt/decrypt roundtrip", () => {
    const svc = new EncryptionService(
      buildConfig({
        NODE_ENV: "test",
        SETTINGS_ENCRYPTION_KEY: "unit-test-master-key",
      }),
    );

    it("decrypts what it encrypts", () => {
      const { encryptedValue, iv } = svc.encrypt("sk-secret-value");
      expect(svc.decrypt(encryptedValue, iv)).toBe("sk-secret-value");
    });

    it("different IVs produce different ciphertexts", () => {
      const a = svc.encrypt("same-plaintext");
      const b = svc.encrypt("same-plaintext");
      expect(a.iv).not.toBe(b.iv);
      expect(a.encryptedValue).not.toBe(b.encryptedValue);
    });

    it("returns null for invalid ciphertext", () => {
      expect(svc.decrypt("not-hex", "bad-iv")).toBeNull();
    });

    it("returns null for empty input", () => {
      expect(svc.decrypt("", "")).toBeNull();
    });
  });

  describe("encryptForUser/decryptForUser — HKDF per-user 子密钥", () => {
    const svc = new EncryptionService(
      buildConfig({
        NODE_ENV: "test",
        SETTINGS_ENCRYPTION_KEY: "unit-test-master-key",
      }),
    );

    it("roundtrips with the same userId", () => {
      const { encryptedValue, iv } = svc.encryptForUser("sk-user-a", "user-a");
      expect(encryptedValue).not.toContain("sk-user-a");
      expect(svc.decryptForUser(encryptedValue, iv, "user-a")).toBe("sk-user-a");
    });

    it("isolates users: user B cannot decrypt user A's ciphertext", () => {
      const { encryptedValue, iv } = svc.encryptForUser("sk-user-a", "user-a");
      expect(svc.decryptForUser(encryptedValue, iv, "user-b")).toBeNull();
    });

    it("user subkey differs from admin key (admin decrypt fails)", () => {
      const { encryptedValue, iv } = svc.encryptForUser("sk-user-a", "user-a");
      expect(svc.decrypt(encryptedValue, iv)).toBeNull();
    });

    it("returns null for empty input", () => {
      expect(svc.decryptForUser("", "", "user-a")).toBeNull();
    });
  });

  describe("decryptLegacy", () => {
    const svc = new EncryptionService(
      buildConfig({
        NODE_ENV: "test",
        SETTINGS_ENCRYPTION_KEY: "unit-test-master-key",
      }),
    );

    it("handles the colon-separated legacy format", () => {
      // produce ciphertext with the current key + synthesize legacy format
      const { encryptedValue, iv } = svc.encrypt("legacy-secret");
      const legacy = `${iv}:${encryptedValue}`;
      expect(svc.decryptLegacy(legacy)).toBe("legacy-secret");
    });

    it("returns input unchanged when not in legacy format", () => {
      expect(svc.decryptLegacy("no-colon-here")).toBe("no-colon-here");
    });

    it("returns null for null input", () => {
      expect(svc.decryptLegacy(null)).toBeNull();
    });
  });

  describe("hashValue", () => {
    const svc = new EncryptionService(
      buildConfig({
        NODE_ENV: "test",
        SETTINGS_ENCRYPTION_KEY: "unit-test-master-key",
      }),
    );

    it("produces stable sha256 hex output", () => {
      const hash = svc.hashValue("hello");
      expect(hash).toHaveLength(64);
      expect(hash).toBe(svc.hashValue("hello"));
    });
  });

  describe("createKeyHint", () => {
    const svc = new EncryptionService(
      buildConfig({
        NODE_ENV: "test",
        SETTINGS_ENCRYPTION_KEY: "unit-test-master-key",
      }),
    );

    it("masks long keys with prefix+suffix", () => {
      expect(svc.createKeyHint("sk-abcdef1234567890")).toBe("sk-...7890");
    });

    it("returns *** for very short input", () => {
      expect(svc.createKeyHint("abc")).toBe("***");
    });

    it("returns *** for empty", () => {
      expect(svc.createKeyHint("")).toBe("***");
    });
  });
});
