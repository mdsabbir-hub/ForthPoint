import { describe, expect, it } from "vitest";
import { can, hasAnyRole, isAppRole } from "@/lib/permissions/roles";

describe("permissions", () => {
  it("validates role names", () => {
    expect(isAppRole("admin")).toBe(true);
    expect(isAppRole("root")).toBe(false);
    expect(isAppRole(undefined)).toBe(false);
  });
  it("hasAnyRole matches", () => {
    expect(hasAnyRole(["reviewer"], ["admin"])).toBe(false);
    expect(hasAnyRole(["reviewer", "admin"], ["admin"])).toBe(true);
  });
  it("reviewers cannot publish", () => {
    expect(can(["reviewer"], "import.publish")).toBe(false);
    expect(can(["reviewer"], "import.review")).toBe(true);
  });
  it("publishers can publish but not manage users", () => {
    expect(can(["publisher"], "import.publish")).toBe(true);
    expect(can(["publisher"], "users.manage")).toBe(false);
  });
  it("no roles means no access", () => {
    expect(can([], "admin.access")).toBe(false);
  });
});
