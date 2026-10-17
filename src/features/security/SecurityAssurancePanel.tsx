import React, { useState } from 'react';
import { Button } from '../../components/common/Button';
import { storageEngine } from '../../services/storageEngine';
import { validateTaskTransition } from '../../domain/taskStateMachine';

interface SecurityCheckResult {
  id: string;
  name: string;
  description: string;
  expected: string;
  actual: string;
  status: 'passed' | 'failed' | 'pending';
}

export const SecurityAssurancePanel: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<SecurityCheckResult[]>([
    {
      id: 'NEG-01',
      name: 'Unshared Project Isolation',
      description: 'Verify non-members receive permission denied when attempting to read confidential projects.',
      expected: 'Permission denied: You do not have access to this project.',
      actual: 'Awaiting execution...',
      status: 'pending',
    },
    {
      id: 'NEG-02',
      name: 'Viewer Mutation Prevention',
      description: 'Verify user with role Viewer is strictly blocked from creating or modifying tasks.',
      expected: 'Permission denied: Viewers have read-only access and cannot mutate tasks.',
      actual: 'Awaiting execution...',
      status: 'pending',
    },
    {
      id: 'NEG-03',
      name: 'Illegal State Jump Guard',
      description: 'Verify direct status transition from Done to Blocked is rejected by domain state machine.',
      expected: 'A completed task cannot transition directly to Blocked. Reopen to Todo first.',
      actual: 'Awaiting execution...',
      status: 'pending',
    },
    {
      id: 'NEG-04',
      name: 'Mandatory Blocker Reason Guard',
      description: 'Verify transitioning to Blocked without reason is rejected by domain validation.',
      expected: 'A detailed blocker reason (at least 5 characters) is required when marking a task Blocked.',
      actual: 'Awaiting execution...',
      status: 'pending',
    },
    {
      id: 'NEG-05',
      name: 'Double-Submit Idempotency Lock',
      description: 'Verify rapid duplicate mutation triggers return the identical in-flight promise (DEC-007).',
      expected: 'Second duplicate mutation locked and reused identical promise without creating duplicate record.',
      actual: 'Awaiting execution...',
      status: 'pending',
    },
  ]);

  const handleRunChecks = async () => {
    setIsRunning(true);
    const newResults: SecurityCheckResult[] = [...results];

    // NEG-01: Non-member project access
    try {
      const marcusUser = storageEngine.getUser('user-member-marcus');
      if (marcusUser) {
        // Marcus is NOT in proj-secret-02 memberIds
        storageEngine.getProjectById('proj-secret-02', marcusUser);
        newResults[0].actual = 'FAIL: Marcus was unexpectedly allowed to read unshared project!';
        newResults[0].status = 'failed';
      }
    } catch (err: unknown) {
      newResults[0].actual = err instanceof Error ? err.message : String(err);
      newResults[0].status = 'passed';
    }

    // NEG-02: Viewer mutation prevention
    try {
      const viewerUser = storageEngine.getUser('user-viewer-elena');
      if (viewerUser) {
        storageEngine.saveTask({
          id: 'test-illegal-viewer-task',
          workspaceId: 'ws-ojix-main',
          projectId: 'proj-infra-01',
          title: 'Illegal task by viewer',
          description: '',
          assigneeId: null,
          priority: 'low',
          status: 'todo',
          dueDate: '2026-10-30',
          createdBy: viewerUser.uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, viewerUser);
        newResults[1].actual = 'FAIL: Viewer mutation was allowed!';
        newResults[1].status = 'failed';
      }
    } catch (err: unknown) {
      newResults[1].actual = err instanceof Error ? err.message : String(err);
      newResults[1].status = 'passed';
    }

    // NEG-03: Illegal state transition Done -> Blocked
    const transitionCheck = validateTaskTransition(
      { status: 'done', assigneeId: 'user-member-marcus', title: 'Test Done Task' },
      'blocked'
    );
    if (!transitionCheck.valid && transitionCheck.code === 'DONE_CANNOT_BE_BLOCKED') {
      newResults[2].actual = transitionCheck.error || 'Rejected by state machine.';
      newResults[2].status = 'passed';
    } else {
      newResults[2].actual = 'FAIL: Invalid transition was permitted!';
      newResults[2].status = 'failed';
    }

    // NEG-04: Mandatory blocker reason
    const blockerCheck = validateTaskTransition(
      { status: 'in_progress', assigneeId: 'user-member-marcus', title: 'In Progress Task' },
      'blocked',
      '' // Empty blocker reason
    );
    if (!blockerCheck.valid && blockerCheck.code === 'BLOCKER_REASON_REQUIRED') {
      newResults[3].actual = blockerCheck.error || 'Rejected by blocker guard.';
      newResults[3].status = 'passed';
    } else {
      newResults[3].actual = 'FAIL: Moving to Blocked without reason was permitted!';
      newResults[3].status = 'failed';
    }

    // NEG-05: Double-mutation idempotency lock
    const testKey = `test-idempotency-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    let executionCount = 0;
    const p1 = storageEngine.executeIdempotent(testKey, async () => {
      executionCount++;
      return 'created-once';
    });
    const p2 = storageEngine.executeIdempotent(testKey, async () => {
      executionCount++;
      return 'created-twice';
    });

    const [res1, res2] = await Promise.all([p1, p2]);

    if (p1 === p2 && executionCount === 1 && res1 === 'created-once' && res2 === 'created-once') {
      newResults[4].actual = 'Second duplicate mutation locked and reused identical promise without creating duplicate record.';
      newResults[4].status = 'passed';
    } else {
      newResults[4].actual = `FAIL: Idempotency lock failed. executionCount=${executionCount}, samePromise=${p1 === p2}`;
      newResults[4].status = 'failed';
    }

    setResults(newResults);
    setIsRunning(false);
  };

  const passedCount = results.filter(r => r.status === 'passed').length;

  return (
    <div className="security-panel-container">
      <div className="security-panel-header">
        <div>
          <h2 className="security-title">Security & Policy Verification</h2>
          <p className="security-subtitle">
            Direct tests verifying project isolation, state transition guards, and role permissions.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={handleRunChecks}
          isLoading={isRunning}
          id="run-security-checks-btn"
        >
          Run Policy Checks
        </Button>
      </div>

      <div className="assurance-score-card">
        <div className="score-main">
          <span className="score-num">{passedCount} / {results.length}</span>
          <span className="score-label">Security & boundary checks passing</span>
        </div>
        <div className="score-status-tag">
          {passedCount === results.length ? (
            <span className="badge badge-status-done">ALL CHECKS PASSING</span>
          ) : (
            <span className="badge badge-urgent">PENDING VERIFICATION</span>
          )}
        </div>
      </div>

      <div className="assurance-checks-list">
        {results.map(check => (
          <div key={check.id} className={`check-card check-${check.status}`}>
            <div className="check-card-header">
              <div className="check-header-left">
                <span className="check-id">{check.id}</span>
                <h4 className="check-name">{check.name}</h4>
              </div>
              <span className={`check-status-badge badge-${check.status}`}>
                {check.status.toUpperCase()}
              </span>
            </div>
            <p className="check-desc">{check.description}</p>
            <div className="check-evidence-box">
              <div className="evidence-row">
                <span className="evidence-label">Expected:</span>
                <span className="evidence-val">{check.expected}</span>
              </div>
              <div className="evidence-row">
                <span className="evidence-label">Observed:</span>
                <span className="evidence-val evidence-observed">{check.actual}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
