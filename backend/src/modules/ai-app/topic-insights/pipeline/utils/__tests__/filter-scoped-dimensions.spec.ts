import { filterScopedDimensions } from "../filter-scoped-dimensions";

describe("filterScopedDimensions", () => {
  const dims = [
    { id: "d1", name: "market" },
    { id: "d2", name: "tech" },
    { id: "d3", name: "competition" },
  ];

  it("undefined scope returns all", () => {
    expect(filterScopedDimensions(dims, undefined)).toEqual(dims);
  });

  it("empty scope returns all", () => {
    expect(filterScopedDimensions(dims, [])).toEqual(dims);
  });

  it("filters by id match", () => {
    expect(filterScopedDimensions(dims, ["d2"])).toEqual([dims[1]]);
  });

  it("filters by name match when id absent", () => {
    const noIds = [{ name: "market" }, { name: "tech" }];
    expect(filterScopedDimensions(noIds, ["tech"])).toEqual([noIds[1]]);
  });

  it("scope with mixed ids/names keeps each matching once", () => {
    const out = filterScopedDimensions(dims, ["d1", "competition"]);
    expect(out).toEqual([dims[0], dims[2]]);
  });

  it("scope with no matches returns empty", () => {
    expect(filterScopedDimensions(dims, ["nope"])).toEqual([]);
  });
});
