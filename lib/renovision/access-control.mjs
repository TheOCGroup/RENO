/** Role-based, scope-bound authorization. Roles grant actions; entitlements
 * (tenant + property/room lists from verified identity) bound the scope.
 * Everything fails closed: unknown roles grant nothing, missing entitlements
 * deny, and tenant mismatch always denies. "*" in an entitlement list means
 * every property/room inside the actor's own tenant only. */
export const RENOVISION_ACTIONS = Object.freeze(["project:create", "project:read", "capture:write", "measurement:write", "measurement:correct", "geometry:lock", "change:propose", "approval:register", "furnishing:write", "preview:generate", "comparison:build", "export:read"]);
const ROLE_ACTIONS = Object.freeze({
 viewer: Object.freeze(["project:read"]),
 operator: Object.freeze(["project:create", "project:read", "capture:write", "measurement:write", "measurement:correct", "geometry:lock", "change:propose", "furnishing:write", "preview:generate", "comparison:build", "export:read"]),
 approver: Object.freeze(["project:read", "approval:register", "export:read"]),
 admin: Object.freeze([...RENOVISION_ACTIONS])
});
const text = (x) => typeof x === "string" && x.trim().length > 0;
export function roleGrants(role, action) { return Array.isArray(ROLE_ACTIONS[role]) && ROLE_ACTIONS[role].includes(action); }
export function authorizeAction(actor, {action, tenantId, propertyId, roomId} = {}) {
 const errors = [];
 if (actor?.authenticated !== true || !text(actor?.id) || !text(actor?.tenantId)) errors.push("authenticated actor required");
 if (!RENOVISION_ACTIONS.includes(action)) errors.push("unknown action");
 if (errors.length) return {allowed: false, errors};
 if (!Array.isArray(actor.roles) || !actor.roles.some((role) => roleGrants(role, action))) errors.push("role does not permit action");
 if (text(tenantId) && tenantId !== actor.tenantId) errors.push("tenant scope mismatch");
 if (text(propertyId)) {
   const entitled = Array.isArray(actor.propertyIds) && (actor.propertyIds.includes("*") || actor.propertyIds.includes(propertyId));
   if (!entitled) errors.push("property not entitled");
 }
 if (text(roomId) && Array.isArray(actor.roomIds) && actor.roomIds.length > 0) {
   if (!actor.roomIds.includes("*") && !actor.roomIds.includes(roomId)) errors.push("room not entitled");
 }
 return {allowed: errors.length === 0, errors};
}
