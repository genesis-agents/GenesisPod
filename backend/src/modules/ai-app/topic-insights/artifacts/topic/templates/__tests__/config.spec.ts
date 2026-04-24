/**
 * Data-integrity checks for built-in dimension templates.
 * Template config is load-bearing for /topics/templates + /topics/from-template.
 */

import { ResearchTopicType } from "@prisma/client";

import { DIMENSION_TEMPLATES } from "../config";

describe("DIMENSION_TEMPLATES config", () => {
  it("covers every ResearchTopicType with at least one template", () => {
    const covered = new Set(DIMENSION_TEMPLATES.map((t) => t.topicType));
    for (const type of Object.values(ResearchTopicType)) {
      expect(covered.has(type)).toBe(true);
    }
  });

  it("has unique template ids", () => {
    const ids = DIMENSION_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(DIMENSION_TEMPLATES.map((t) => [t.id, t]))(
    "%s has unique dimension ids",
    (_id, template) => {
      const dimIds = template.dimensions.map((d) => d.id);
      expect(new Set(dimIds).size).toBe(dimIds.length);
    },
  );

  it.each(DIMENSION_TEMPLATES.map((t) => [t.id, t]))(
    "%s: every dimension has ≥1 query + ≥1 dataSource + minSources>0",
    (_id, template) => {
      expect(template.dimensions.length).toBeGreaterThanOrEqual(4);
      for (const d of template.dimensions) {
        expect(d.queryTemplates.length).toBeGreaterThan(0);
        expect(d.dataSources.length).toBeGreaterThan(0);
        expect(d.minSources).toBeGreaterThan(0);
        expect(d.name.trim()).not.toBe("");
        expect(d.description.trim()).not.toBe("");
        expect(d.purpose.trim()).not.toBe("");
      }
    },
  );

  it.each(DIMENSION_TEMPLATES.map((t) => [t.id, t]))(
    "%s: sortOrder values are strictly ascending",
    (_id, template) => {
      const orders = template.dimensions.map((d) => d.sortOrder);
      const sorted = [...orders].sort((a, b) => a - b);
      expect(orders).toEqual(sorted);
      expect(new Set(orders).size).toBe(orders.length);
    },
  );

  it("uses {topicName} placeholder in every queryTemplate", () => {
    for (const template of DIMENSION_TEMPLATES) {
      for (const d of template.dimensions) {
        for (const q of d.queryTemplates) {
          expect(q).toContain("{topicName}");
        }
      }
    }
  });
});
