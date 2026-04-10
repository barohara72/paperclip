import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueRoutes } from "../routes/issues.js";
import { errorHandler } from "../middleware/index.js";

const mockIssueService = vi.hoisted(() => ({
  createOrReuse: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  wakeup: vi.fn(async () => undefined),
  reportRunActivity: vi.fn(async () => undefined),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn(async () => undefined));
const mockQueueIssueAssignmentWakeup = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  documentService: () => ({}),
  executionWorkspaceService: () => ({}),
  goalService: () => ({}),
  heartbeatService: () => mockHeartbeatService,
  issueApprovalService: () => ({}),
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
  projectService: () => ({}),
  routineService: () => ({ syncRunStatusForIssue: vi.fn(async () => undefined) }),
  workProductService: () => ({}),
}));

vi.mock("../services/issue-assignment-wakeup.js", () => ({
  queueIssueAssignmentWakeup: mockQueueIssueAssignmentWakeup,
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "local-board",
      companyIds: ["company-1"],
      source: "local_implicit",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use("/api", issueRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

const issueId = "11111111-1111-4111-8111-111111111111";
const parentId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const assigneeAgentId = "44444444-4444-4444-8444-444444444444";

function makeIssue() {
  return {
    id: issueId,
    companyId: "company-1",
    projectId,
    goalId: null,
    parentId,
    assigneeAgentId,
    assigneeUserId: null,
    createdByAgentId: null,
    createdByUserId: "local-board",
    title: "Stand up founding engineer sourcing channels and candidate pipeline",
    description: "Own execution of sourcing operations for the founding engineer hire.",
    status: "todo",
    priority: "high",
    issueNumber: 8,
    identifier: "HER-8",
    requestDepth: 0,
    billingCode: null,
    originKind: "manual",
    originId: null,
    originRunId: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    executionRunId: null,
    executionLockedAt: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    assigneeAdapterOverrides: null,
    projectWorkspaceId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    labels: [],
    labelIds: [],
  };
}

describe("issue create duplicate-prevention route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and skips wakeup/logged creation when reusing an existing duplicate child issue", async () => {
    mockIssueService.createOrReuse.mockResolvedValue({ issue: makeIssue(), created: false });

    const res = await request(createApp())
      .post("/api/companies/company-1/issues")
      .send({
        projectId,
        parentId,
        title: "Stand up founding engineer sourcing channels and candidate pipeline",
        description: "Own execution of sourcing operations for the founding engineer hire.",
        status: "todo",
        priority: "high",
        assigneeAgentId,
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(issueId);
    expect(mockIssueService.createOrReuse).toHaveBeenCalled();
    expect(mockQueueIssueAssignmentWakeup).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "issue.created" }),
    );
  });

  it("returns 201 and wakes assignee when a fresh issue is created", async () => {
    mockIssueService.createOrReuse.mockResolvedValue({ issue: makeIssue(), created: true });

    const res = await request(createApp())
      .post("/api/companies/company-1/issues")
      .send({
        projectId,
        parentId,
        title: "Stand up founding engineer sourcing channels and candidate pipeline",
        description: "Own execution of sourcing operations for the founding engineer hire.",
        status: "todo",
        priority: "high",
        assigneeAgentId,
      });

    expect(res.status).toBe(201);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "issue.created", entityId: issueId }),
    );
    expect(mockQueueIssueAssignmentWakeup).toHaveBeenCalledTimes(1);
  });
});
