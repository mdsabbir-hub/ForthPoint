export const ROLES = ["admin", "reviewer", "publisher"] as const;
export type AppRole = (typeof ROLES)[number];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function hasAnyRole(held: readonly string[], allowed: readonly AppRole[]): boolean {
  return held.some((r) => (allowed as readonly string[]).includes(r));
}

/** Permission matrix. Reviewers can inspect/comment; only publisher/admin can publish. */
export const PERMISSIONS = {
  "admin.access": ["admin", "reviewer", "publisher"],
  "import.upload": ["admin"],
  "import.review": ["admin", "reviewer", "publisher"],
  "import.publish": ["admin", "publisher"],
  "users.manage": ["admin"],
  "audit.read": ["admin"],
} as const satisfies Record<string, readonly AppRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(held: readonly string[], permission: Permission): boolean {
  return hasAnyRole(held, PERMISSIONS[permission]);
}
