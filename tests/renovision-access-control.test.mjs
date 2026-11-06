import test from "node:test";
import assert from "node:assert/strict";
import {authorizeAction, roleGrants} from "../lib/renovision/access-control.mjs";
const operator = {id: "op-1", tenantId: "tenant-a", authenticated: true, roles: ["operator"], propertyIds: ["property-1"], roomIds: []};
const viewer = {...operator, id: "vw-1", roles: ["viewer"]};
const approver = {...operator, id: "ap-1", roles: ["approver"]};
const admin = {...operator, id: "ad-1", roles: ["admin"], propertyIds: ["*"]};
test("operators can work inside their entitled property scope", () => {
 assert.equal(authorizeAction(operator, {action: "measurement:write", tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1"}).allowed, true);
 assert.equal(authorizeAction(operator, {action: "geometry:lock", tenantId: "tenant-a", propertyId: "property-1"}).allowed, true);
});
test("viewers are read-only", () => {
 assert.equal(authorizeAction(viewer, {action: "project:read", tenantId: "tenant-a", propertyId: "property-1"}).allowed, true);
 assert.equal(authorizeAction(viewer, {action: "measurement:write", tenantId: "tenant-a", propertyId: "property-1"}).allowed, false);
 assert.equal(authorizeAction(viewer, {action: "export:read", tenantId: "tenant-a", propertyId: "property-1"}).allowed, false);
});
test("only approvers and admins can register approvals", () => {
 assert.equal(authorizeAction(approver, {action: "approval:register", tenantId: "tenant-a", propertyId: "property-1"}).allowed, true);
 assert.equal(authorizeAction(operator, {action: "approval:register", tenantId: "tenant-a", propertyId: "property-1"}).allowed, false);
 assert.equal(authorizeAction(admin, {action: "approval:register", tenantId: "tenant-a", propertyId: "property-1"}).allowed, true);
});
test("horizontal escalation across tenants and properties is denied", () => {
 assert.equal(authorizeAction(operator, {action: "project:read", tenantId: "tenant-b", propertyId: "property-1"}).allowed, false);
 assert.equal(authorizeAction(operator, {action: "project:read", tenantId: "tenant-a", propertyId: "property-2"}).allowed, false);
 assert.equal(authorizeAction(admin, {action: "project:read", tenantId: "tenant-b", propertyId: "property-1"}).allowed, false);
});
test("room entitlements narrow access when present", () => {
 const roomBound = {...operator, roomIds: ["room-9"]};
 assert.equal(authorizeAction(roomBound, {action: "project:read", tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1"}).allowed, false);
 assert.equal(authorizeAction(roomBound, {action: "project:read", tenantId: "tenant-a", propertyId: "property-1", roomId: "room-9"}).allowed, true);
});
test("missing entitlements and unknown roles fail closed", () => {
 assert.equal(authorizeAction({...operator, propertyIds: []}, {action: "project:read", tenantId: "tenant-a", propertyId: "property-1"}).allowed, false);
 assert.equal(authorizeAction({...operator, roles: ["superuser"]}, {action: "project:read", tenantId: "tenant-a", propertyId: "property-1"}).allowed, false);
 assert.equal(authorizeAction({id: "x"}, {action: "project:read"}).allowed, false);
 assert.equal(roleGrants("nobody", "project:read"), false);
});
