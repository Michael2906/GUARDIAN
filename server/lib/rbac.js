/**
 * Central role-based access-control authority.
 *
 * Single source of truth for the role hierarchy and who may assign/manage whom.
 * Enforced server-side so the rules hold regardless of what the UI offers.
 *
 * Hierarchy (by scope):
 *   platform : guardian-admin
 *   company  : storage-admin > storage-manager > storage-employee
 *   client   : client-admin > client-user > client-viewer
 */

const ROLES = [
  "guardian-admin",
  "storage-admin",
  "storage-manager",
  "storage-employee",
  "client-admin",
  "client-user",
  "client-viewer",
];

// Relative authority; higher can manage lower.
const RANK = {
  "guardian-admin": 100,
  "storage-admin": 50,
  "storage-manager": 40,
  "storage-employee": 30,
  "client-admin": 20,
  "client-user": 10,
  "client-viewer": 5,
};

// Which context a role belongs to.
const SCOPE = {
  "guardian-admin": "platform",
  "storage-admin": "company",
  "storage-manager": "company",
  "storage-employee": "company",
  "client-admin": "client",
  "client-user": "client",
  "client-viewer": "client",
};

const isValidRole = (r) => ROLES.includes(r);

/**
 * Roles a given actor may create or assign to someone else.
 * - guardian-admin: anything (absolute control)
 * - storage-admin: any storage role + set up their clients' users
 * - storage-manager: employees only
 * - client-admin: users/viewers within their own client business
 */
function assignableRoles(actorRole) {
  switch (actorRole) {
    case "guardian-admin":
      return [...ROLES];
    case "storage-admin":
      return [
        "storage-admin",
        "storage-manager",
        "storage-employee",
        "client-admin",
        "client-user",
        "client-viewer",
      ];
    case "storage-manager":
      return ["storage-employee"];
    case "client-admin":
      return ["client-user", "client-viewer"];
    default:
      return [];
  }
}

// May the actor assign this target role at all?
const canAssignRole = (actorRole, targetRole) =>
  isValidRole(targetRole) && assignableRoles(actorRole).includes(targetRole);

// May the actor manage (edit/deactivate) a user who currently holds targetRole?
// Same authority as assigning it.
const canManageRole = (actorRole, targetRole) => canAssignRole(actorRole, targetRole);

/**
 * Resource write (create/update/delete) permissions by role. Read access is
 * handled by per-route tenant scoping; this governs mutations.
 */
const RESOURCE_WRITE_ROLES = {
  company: ["guardian-admin"],
  user: ["guardian-admin", "storage-admin", "storage-manager", "client-admin"],
  warehouse: ["guardian-admin", "storage-admin", "storage-manager"],
  client: ["guardian-admin", "storage-admin", "storage-manager"],
  invoice: ["guardian-admin", "storage-admin", "storage-manager"],
  inventory: [
    "guardian-admin",
    "storage-admin",
    "storage-manager",
    "storage-employee",
    "client-admin",
    "client-user",
  ],
};

const canWriteResource = (actorRole, resource) =>
  (RESOURCE_WRITE_ROLES[resource] || []).includes(actorRole);

const isGuardian = (role) => role === "guardian-admin";
const isStorageRole = (role) => SCOPE[role] === "company";
const isClientRole = (role) => SCOPE[role] === "client";

module.exports = {
  ROLES,
  RANK,
  SCOPE,
  isValidRole,
  assignableRoles,
  canAssignRole,
  canManageRole,
  RESOURCE_WRITE_ROLES,
  canWriteResource,
  isGuardian,
  isStorageRole,
  isClientRole,
};
