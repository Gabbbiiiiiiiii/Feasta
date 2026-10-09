import {beforeEach, expect, it, vi} from "vitest";
import type {AdminUserFilters} from "@/lib/admin/users/admin-user-types";

const state = vi.hoisted(() => ({queries: [] as {collection: string; conditions: unknown[]}[]}));
vi.mock("@/lib/auth/session", () => ({requireAdmin: vi.fn()}));
vi.mock("@/lib/firebase/admin", () => {
  type Row = Record<string, unknown>;
  const rows: Row[] = [
    {id: "active", role: "customer", isActive: true, isBlocked: false, accountStatus: "active"},
    {id: "disabled", role: "customer", isActive: false, isBlocked: false, accountStatus: "disabled"},
    {id: "blocked", role: "customer", isActive: false, isBlocked: true, accountStatus: "blocked"},
    {id: "blocked-provider", role: "provider", isActive: true, isBlocked: true, accountStatus: "blocked"},
  ].map(row => ({...row, firstName: row.id, lastName: "Account", email: `${row.id}@example.test`, createdAt: new Date("2026-10-01T00:00:00Z")}));
  function matches(row: Row, condition: {field?: string; operator?: string; value?: unknown; alternatives?: Parameters<typeof matches>[1][]}): boolean {
    if (condition.alternatives) return condition.alternatives.some(alternative => matches(row, alternative));
    if (condition.operator === "==") return row[condition.field!] === condition.value;
    if (condition.operator === "in") return (condition.value as unknown[]).includes(row[condition.field!]);
    return true;
  }
  class Query {
    conditions: Parameters<typeof matches>[1][] = [];
    constructor(public collection: string) {}
    where(field: string | Parameters<typeof matches>[1], operator?: string, value?: unknown) {
      const next = new Query(this.collection); next.conditions = [...this.conditions, typeof field === "string" ? {field, operator, value} : field]; return next;
    }
    orderBy() {return this;}
    limit() {return this;}
    count() {return {get: async () => ({data: () => ({count: 0})})};}
    async get() {
      state.queries.push(this);
      const selected = this.collection === "users" ? rows.filter(row => this.conditions.every(condition => matches(row, condition))) : [];
      return {docs: selected.map(row => ({id: row.id, data: () => row})), empty: selected.length === 0};
    }
  }
  return {adminDb: {collection: (name: string) => new Query(name)}};
});
import {getAdminUserPage} from "@/lib/admin/users/admin-user-service";
const filters: AdminUserFilters = {search: "", role: "all", accountStatus: "all", verificationStatus: "all", pageSize: 10, cursor: null};
beforeEach(() => {state.queries.length = 0;});

it("normalizes Restricted and queries both canonical restriction states using existing indexes", async () => {
  const result = await getAdminUserPage({...filters, accountStatus: "restricted"});
  expect(result.users.map(user => user.id)).toEqual(["disabled", "blocked", "blocked-provider"]);
  const query = state.queries.find(query => query.collection === "users")!;
  expect(query.conditions).toContainEqual({field: "accountStatus", operator: "in", value: ["disabled", "blocked"]});
});

it("combines role, restriction and search without reintroducing verification filtering", async () => {
  const result = await getAdminUserPage({...filters, role: "provider", accountStatus: "restricted", search: "blocked-provider"});
  expect(result.users.map(user => user.id)).toEqual(["blocked-provider"]);
});

it("clears the grouped restriction while retaining canonical legacy filters", async () => {
  const all = await getAdminUserPage(filters);
  expect(all.users).toHaveLength(4);
  const active = await getAdminUserPage({...filters, accountStatus: "active"});
  expect(active.users.map(user => user.id)).toEqual(["active"]);
  const disabled = await getAdminUserPage({...filters, accountStatus: "disabled"});
  expect(disabled.users.map(user => user.id)).toEqual(["disabled"]);
});
