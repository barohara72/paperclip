import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, createDb, issues, projects } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueService } from "../services/issues.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("issue service duplicate child prevention", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-issue-duplicate-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(issues);
    await db.delete(projects);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedFixture() {
    const companyId = randomUUID();
    const projectId = randomUUID();
    const agentId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: "HER",
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "CTO",
      role: "cto",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Onboarding",
      status: "in_progress",
    });
    const svc = issueService(db);
    const parent = await svc.create(companyId, {
      projectId,
      title: "Kick off founding engineer sourcing and candidate pipeline",
      description: "Parent issue",
      status: "todo",
      priority: "high",
      assigneeAgentId: agentId,
    });
    return { companyId, projectId, agentId, parent, svc };
  }

  it("reuses an existing matching child issue under the same parent", async () => {
    const { companyId, projectId, agentId, parent, svc } = await seedFixture();

    const first = await svc.createOrReuse(companyId, {
      projectId,
      parentId: parent.id,
      title: "Stand up founding engineer sourcing channels and candidate pipeline",
      description: "Own execution of sourcing operations for the founding engineer hire.",
      status: "todo",
      priority: "high",
      assigneeAgentId: agentId,
    });

    const second = await svc.createOrReuse(companyId, {
      projectId,
      parentId: parent.id,
      title: "  Stand up founding engineer sourcing channels and candidate pipeline  ",
      description: "Own execution of sourcing operations for the founding engineer hire.\n",
      status: "todo",
      priority: "high",
      assigneeAgentId: agentId,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.issue.id).toBe(first.issue.id);

    const childIssues = await db.select().from(issues);
    expect(childIssues.filter((issue) => issue.parentId === parent.id)).toHaveLength(1);
  });

  it("creates a fresh child issue when the title differs", async () => {
    const { companyId, projectId, agentId, parent, svc } = await seedFixture();

    const first = await svc.createOrReuse(companyId, {
      projectId,
      parentId: parent.id,
      title: "Stand up founding engineer sourcing channels and candidate pipeline",
      description: "Own execution of sourcing operations for the founding engineer hire.",
      status: "todo",
      priority: "high",
      assigneeAgentId: agentId,
    });

    const second = await svc.createOrReuse(companyId, {
      projectId,
      parentId: parent.id,
      title: "Generate candidate-list seed criteria",
      description: "Own execution of sourcing operations for the founding engineer hire.",
      status: "todo",
      priority: "high",
      assigneeAgentId: agentId,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(second.issue.id).not.toBe(first.issue.id);

    const childIssues = await db.select().from(issues);
    expect(childIssues.filter((issue) => issue.parentId === parent.id)).toHaveLength(2);
  });
});
