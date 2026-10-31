import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const caller = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  const target = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  return { caller, target, from: vi.fn(() => caller), adminFrom: vi.fn(() => target),
    updateUser: vi.fn(), createUser: vi.fn(), getUser: vi.fn(), listUsers: vi.fn() };
});
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: mocks.adminFrom, auth: { admin: { updateUserById: mocks.updateUser, createUser: mocks.createUser, getUserById: mocks.getUser, listUsers: mocks.listUsers } },
} }));
import { createTeamMemberHandler as createTeamMember, listTeamMembersHandler as listTeamMembers, setTeamMemberPasswordHandler as setTeamMemberPassword } from "./team-management.server";
function invoke(fn: unknown, data: Record<string, unknown> = {}) {
  return (fn as (arg: unknown) => Promise<{ success: boolean; error?: string; members?: unknown[] }>)({
    data, context: { supabase: { from: mocks.from }, userId: "caller" },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.caller.select.mockReturnValue(mocks.caller); mocks.caller.eq.mockReturnValue(mocks.caller);
  mocks.target.select.mockReturnValue(mocks.target); mocks.target.eq.mockReturnValue(mocks.target);
  mocks.caller.maybeSingle.mockResolvedValue({ data: { clinic_id: "company-a", role: "CEO", account_subtype: "CEO" }, error: null });
  mocks.target.maybeSingle.mockResolvedValue({ data: { id: "target", clinic_id: "company-b" }, error: null });
});
describe("server-side team password and tenant boundaries", () => {
  it.each(["abcdef", "abcdefg", "😀😀😀😀", null, {}])("refuses %s before any privileged password update", async (password) => {
    const result = await invoke(setTeamMemberPassword, { user_id: "target", password });
    expect(result.success).toBe(false); expect(result.error).toContain("8 caracteres");
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("does not let an unlinked CEO reset a password in an arbitrary company", async () => {
    mocks.caller.maybeSingle.mockResolvedValue({ data: { clinic_id: null, role: "CEO" }, error: null });
    const result = await invoke(setTeamMemberPassword, { user_id: "target", password: "abcdefgh" });
    expect(result.success).toBe(false); expect(mocks.adminFrom).not.toHaveBeenCalled(); expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("refuses another company's target before reading or changing its Auth account", async () => {
    const result = await invoke(setTeamMemberPassword, { user_id: "target", password: "abcdefgh" });
    expect(result.success).toBe(false); expect(result.error).toContain("própria empresa");
    expect(mocks.getUser).not.toHaveBeenCalled(); expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("does not return a global team list for an unlinked administrator", async () => {
    mocks.caller.maybeSingle.mockResolvedValue({ data: { clinic_id: null, role: "CEO" }, error: null });
    const result = await invoke(listTeamMembers);
    expect(result.success).toBe(false); expect(result.members).toEqual([]); expect(mocks.adminFrom).not.toHaveBeenCalled();
  });
  it("does not create an unscoped Auth account through team administration", async () => {
    mocks.caller.maybeSingle.mockResolvedValue({ data: { clinic_id: null, role: "CEO" }, error: null });
    const result = await invoke(createTeamMember, { email: "fixture@example.invalid", full_name: "Fixture", role: "USER", password: "abcdefgh" });
    expect(result.success).toBe(false); expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it("never resets or reassigns an existing identity after a duplicate-email creation response", async () => {
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { message: "User already registered" } });
    const result = await invoke(createTeamMember, { email: "existing@example.invalid", full_name: "Fixture", role: "USER", password: "abcdefgh" });
    expect(result.success).toBe(false); expect(result.error).toContain("convite");
    expect(mocks.listUsers).not.toHaveBeenCalled(); expect(mocks.updateUser).not.toHaveBeenCalled(); expect(mocks.adminFrom).not.toHaveBeenCalled();
  });
});
