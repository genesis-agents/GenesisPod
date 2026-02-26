import {
  createConstraintProfile,
  getDefaultConstraintProfile,
  mergeConstraintProfiles,
  CONSTRAINT_PRESETS,
} from "../constraint-profile";

describe("createConstraintProfile", () => {
  it("should create from fast preset", () => {
    const profile = createConstraintProfile("fast");
    expect(profile.preset).toBe("fast");
    expect(profile.cost.modelPreference).toBe("cheap");
    expect(profile.quality.depth).toBe("quick");
    expect(profile.efficiency.priority).toBe("urgent");
  });

  it("should create from balanced preset", () => {
    const profile = createConstraintProfile("balanced");
    expect(profile.preset).toBe("balanced");
    expect(profile.cost.modelPreference).toBe("balanced");
    expect(profile.quality.reviewRequired).toBe(true);
  });

  it("should create from thorough preset", () => {
    const profile = createConstraintProfile("thorough");
    expect(profile.preset).toBe("thorough");
    expect(profile.cost.modelPreference).toBe("premium");
    expect(profile.quality.accuracy).toBe("require_evidence");
    expect(profile.quality.maxReworks).toBe(3);
  });

  it("should apply overrides", () => {
    const profile = createConstraintProfile("balanced", {
      cost: { budget: 1000, modelPreference: "premium", allowOverBudget: true, warningThreshold: 0.9 },
    });
    expect(profile.cost.budget).toBe(1000);
    expect(profile.cost.modelPreference).toBe("premium");
    expect(profile.quality.depth).toBe("standard"); // unchanged
  });
});

describe("getDefaultConstraintProfile", () => {
  it("should return balanced preset", () => {
    const profile = getDefaultConstraintProfile();
    expect(profile.preset).toBe("balanced");
    expect(profile.cost).toEqual(CONSTRAINT_PRESETS.balanced.cost);
  });
});

describe("mergeConstraintProfiles", () => {
  it("should merge override into base", () => {
    const base = createConstraintProfile("balanced");
    const merged = mergeConstraintProfiles(base, {
      cost: { budget: 2000 },
      quality: { maxReworks: 5 },
    } as never);

    expect(merged.cost.budget).toBe(2000);
    expect(merged.cost.modelPreference).toBe("balanced"); // preserved from base
    expect(merged.quality.maxReworks).toBe(5);
    expect(merged.quality.depth).toBe("standard"); // preserved from base
  });

  it("should not mutate base profile", () => {
    const base = createConstraintProfile("fast");
    const originalBudget = base.cost.budget;
    mergeConstraintProfiles(base, { cost: { budget: 9999 } } as never);
    expect(base.cost.budget).toBe(originalBudget);
  });
});
