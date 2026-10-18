import { UserProfile, DemoPersona } from '../types/auth';
import { Project } from '../types/project';
import { Task } from '../types/task';
import { ActivityLogEntry } from '../types/audit';

export const DEMO_PERSONAS: readonly DemoPersona[] = [
  {
    uid: 'user-admin-alex',
    email: 'admin@ojix.local',
    displayName: 'Alex Morgan',
    role: 'workspace_admin',
    roleLabel: 'Workspace Admin',
    description: 'Full workspace governance, member directory, and global settings.',
    phone: '+1 (555) 234-5678',
    status: 'active',
  },
  {
    uid: 'user-lead-sarah',
    email: 'lead@ojix.local',
    displayName: 'Sarah Chen',
    role: 'project_lead',
    roleLabel: 'Project Lead',
    description: 'Creates projects, assigns work, and oversees project execution.',
    phone: '+1 (555) 345-6789',
    status: 'active',
  },
  {
    uid: 'user-member-marcus',
    email: 'member@ojix.local',
    displayName: 'Marcus Vance',
    role: 'member',
    roleLabel: 'Member',
    description: 'Executes assigned tasks, posts progress notes, and updates statuses.',
    phone: '+1 (555) 456-7890',
    status: 'active',
  },
  {
    uid: 'user-viewer-elena',
    email: 'viewer@ojix.local',
    displayName: 'Elena Rostova',
    role: 'viewer',
    roleLabel: 'Viewer (Read-Only)',
    description: 'Observes permitted boards and dashboards; cannot modify any data.',
    phone: '+1 (555) 567-8901',
    status: 'active',
  },
];

export const INITIAL_USERS: UserProfile[] = DEMO_PERSONAS.map(p => ({
  uid: p.uid,
  email: p.email,
  displayName: p.displayName,
  role: p.role,
  status: p.status || 'active',
  phone: p.phone,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
}));

export const SAMPLE_PROJECTS: Project[] = [
  {
    id: 'proj-infra-01',
    workspaceId: 'ws-ojix-main',
    name: 'Q4 Cloud Infrastructure & Telemetry',
    objective: 'Modernize Kubernetes clusters, establish distributed tracing, and achieve 99.95% uptime.',
    ownerId: 'user-lead-sarah',
    status: 'active',
    startDate: '2026-10-01',
    dueDate: '2026-12-15',
    memberIds: ['user-admin-alex', 'user-lead-sarah', 'user-member-marcus', 'user-viewer-elena'],
    createdAt: '2026-10-01T09:00:00Z',
    updatedAt: '2026-10-14T14:30:00Z',
  },
  {
    id: 'proj-secret-02',
    workspaceId: 'ws-ojix-main',
    name: 'Confidential Executive Acquisition',
    objective: 'Due diligence and integration roadmap for enterprise telemetry acquisition.',
    ownerId: 'user-lead-sarah',
    status: 'planning',
    startDate: '2026-10-15',
    dueDate: '2026-11-30',
    memberIds: ['user-admin-alex', 'user-lead-sarah'], // Note: Marcus & Elena excluded for negative boundary tests!
    createdAt: '2026-10-15T10:00:00Z',
    updatedAt: '2026-10-15T10:00:00Z',
  },
];

export const SAMPLE_TASKS: Task[] = [
  {
    id: 'task-101',
    workspaceId: 'ws-ojix-main',
    projectId: 'proj-infra-01',
    title: 'Automated container security scanning',
    description: 'Integrate vulnerability scanner into CI/CD pipeline to catch CVEs prior to image build.',
    assigneeId: null,
    priority: 'medium',
    status: 'backlog',
    dueDate: '2026-11-15',
    createdBy: 'user-lead-sarah',
    createdAt: '2026-10-02T11:00:00Z',
    updatedAt: '2026-10-02T11:00:00Z',
  },
  {
    id: 'task-102',
    workspaceId: 'ws-ojix-main',
    projectId: 'proj-infra-01',
    title: 'Zero-trust ingress proxy setup',
    description: 'Deploy Envoy proxy with mTLS validation for internal microservice communication.',
    assigneeId: 'user-member-marcus',
    priority: 'high',
    status: 'todo',
    dueDate: '2026-10-25',
    createdBy: 'user-lead-sarah',
    createdAt: '2026-10-03T09:30:00Z',
    updatedAt: '2026-10-03T09:30:00Z',
  },
  {
    id: 'task-103',
    workspaceId: 'ws-ojix-main',
    projectId: 'proj-infra-01',
    title: 'Redis caching cluster configuration',
    description: 'Provision Redis master-replica cluster with sentinel failover and key eviction policies.',
    assigneeId: 'user-member-marcus',
    priority: 'high',
    status: 'in_progress',
    dueDate: '2026-10-20',
    createdBy: 'user-lead-sarah',
    createdAt: '2026-10-05T14:15:00Z',
    updatedAt: '2026-10-12T16:00:00Z',
  },
  {
    id: 'task-104',
    workspaceId: 'ws-ojix-main',
    projectId: 'proj-infra-01',
    title: 'Database connection pool tuning',
    description: 'Calibrate PgBouncer max connections and transaction pooling mode under load test.',
    assigneeId: 'user-member-marcus',
    priority: 'urgent',
    status: 'in_review',
    dueDate: '2026-10-18',
    createdBy: 'user-member-marcus',
    createdAt: '2026-10-06T10:00:00Z',
    updatedAt: '2026-10-15T11:30:00Z',
  },
  {
    id: 'task-105',
    workspaceId: 'ws-ojix-main',
    projectId: 'proj-infra-01',
    title: 'PCI-DSS compliance audit sign-off',
    description: 'Ensure audit trail logs are immutable and encrypted at rest for quarterly review.',
    assigneeId: 'user-lead-sarah',
    priority: 'urgent',
    status: 'blocked',
    blockerReason: 'Awaiting third-party security firm cryptographic attestation report before staging sign-off.',
    dueDate: '2026-10-19',
    createdBy: 'user-lead-sarah',
    createdAt: '2026-10-07T08:45:00Z',
    updatedAt: '2026-10-14T17:00:00Z',
  },
  {
    id: 'task-106',
    workspaceId: 'ws-ojix-main',
    projectId: 'proj-infra-01',
    title: 'VPC Peering between staging and production',
    description: 'Establish route tables and security group rules for isolated monitoring egress.',
    assigneeId: 'user-member-marcus',
    priority: 'medium',
    status: 'done',
    dueDate: '2026-10-12',
    createdBy: 'user-member-marcus',
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-11T16:45:00Z',
  },
  {
    id: 'task-107',
    workspaceId: 'ws-ojix-main',
    projectId: 'proj-infra-01',
    title: 'Legacy auth token deprecation',
    description: 'Migrate active client SDKs from v1 HMAC tokens to JWT asymmetric signed sessions.',
    assigneeId: 'user-member-marcus',
    priority: 'high',
    status: 'in_progress',
    dueDate: '2026-10-10', // Deliberately past due (relative to current date) for Overdue testing!
    createdBy: 'user-lead-sarah',
    createdAt: '2026-09-28T10:00:00Z',
    updatedAt: '2026-10-09T09:00:00Z',
  },
];

export const SAMPLE_ACTIVITY_LOGS: ActivityLogEntry[] = [
  {
    id: 'log-001',
    workspaceId: 'ws-ojix-main',
    projectId: 'proj-infra-01',
    taskId: 'task-105',
    userId: 'user-lead-sarah',
    userDisplayName: 'Sarah Chen',
    action: 'blocked',
    fieldChanged: 'status',
    oldValue: 'in_progress',
    newValue: 'blocked',
    commentText: 'Blocked: Awaiting third-party security firm cryptographic attestation report.',
    createdAt: '2026-10-14T17:00:00Z',
  },
  {
    id: 'log-002',
    workspaceId: 'ws-ojix-main',
    projectId: 'proj-infra-01',
    taskId: 'task-104',
    userId: 'user-member-marcus',
    userDisplayName: 'Marcus Vance',
    action: 'status_changed',
    fieldChanged: 'status',
    oldValue: 'in_progress',
    newValue: 'in_review',
    commentText: 'Benchmarked pool at 5,000 req/sec; ready for lead review.',
    createdAt: '2026-10-15T11:30:00Z',
  },
];

export const SAMPLE_DIRECT_MESSAGES: import('../types/message').DirectMessage[] = [
  {
    id: 'dm-seed-001',
    conversationId: 'conv-user-lead-sarah-user-member-marcus',
    senderId: 'user-lead-sarah',
    senderDisplayName: 'Sarah Chen',
    recipientId: 'user-member-marcus',
    recipientDisplayName: 'Marcus Vance',
    subject: 'Sprint Priority Alignment',
    body: 'Hey Marcus, let us focus on unblocking the ingress proxy today. The Redis benchmarks looked great!',
    isRead: true,
    createdAt: '2026-10-15T15:00:00Z',
    readAt: '2026-10-15T15:05:00Z',
  },
  {
    id: 'dm-seed-002',
    conversationId: 'conv-user-lead-sarah-user-member-marcus',
    senderId: 'user-member-marcus',
    senderDisplayName: 'Marcus Vance',
    recipientId: 'user-lead-sarah',
    recipientDisplayName: 'Sarah Chen',
    subject: 'Sprint Priority Alignment',
    body: 'Sounds good Sarah! I just pushed the envoy routing configuration updates.',
    isRead: false,
    createdAt: '2026-10-15T16:20:00Z',
  },
];

const isTestEnv =
  (typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || Boolean(process.env?.VITEST))) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test');

export const INITIAL_PROJECTS: Project[] = isTestEnv ? SAMPLE_PROJECTS : [];
export const INITIAL_TASKS: Task[] = isTestEnv ? SAMPLE_TASKS : [];
export const INITIAL_ACTIVITY_LOGS: ActivityLogEntry[] = isTestEnv ? SAMPLE_ACTIVITY_LOGS : [];
export const INITIAL_NOTIFICATIONS: import('../types/message').AppNotification[] = [];
export const INITIAL_DIRECT_MESSAGES: import('../types/message').DirectMessage[] = isTestEnv ? SAMPLE_DIRECT_MESSAGES : [];

