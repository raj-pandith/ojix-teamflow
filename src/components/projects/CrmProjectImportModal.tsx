import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { UserProfile } from '../../types/auth';
import { Project, CrmImportReport } from '../../types/project';
import { crmService, EnrichedCrmProject } from '../../services/crmService';
import { formatDisplayDate } from '../../domain/timezone';
import {
  Building2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  DollarSign,
  Flame,
  ShieldCheck,
  Check,
  FileText,
} from 'lucide-react';

export interface CrmProjectImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onProjectsImported?: (imported: Project[]) => void;
}

export const CrmProjectImportModal: React.FC<CrmProjectImportModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onProjectsImported,
}) => {
  const [projects, setProjects] = useState<EnrichedCrmProject[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<CrmImportReport | null>(null);

  const selectAllRef = useRef<HTMLInputElement>(null);

  // Eligible projects: not already imported and valid date range
  const eligibleProjects = useMemo(() => {
    return projects.filter(p => !p.isAlreadyImported && p.isValidDateRange);
  }, [projects]);

  const eligibleIds = useMemo(() => {
    return eligibleProjects.map(p => p.id);
  }, [eligibleProjects]);

  // Load CRM projects whenever modal opens
  const loadCrmProjects = async () => {
    setIsLoading(true);
    setFetchError(null);
    setImportReport(null);
    setSelectedIds([]);

    const result = await crmService.fetchAvailableProjects(currentUser);
    setIsLoading(false);

    if (!result.success) {
      setFetchError(result.error || 'Failed to fetch available projects from ClientFlow CRM.');
      setProjects([]);
      return;
    }

    setProjects(result.projects);
  };

  useEffect(() => {
    if (isOpen) {
      loadCrmProjects();
    } else {
      setProjects([]);
      setSelectedIds([]);
      setFetchError(null);
      setImportReport(null);
    }
  }, [isOpen]);

  // Handle Indeterminate state for Select All checkbox
  useEffect(() => {
    if (!selectAllRef.current) return;
    const numSelected = selectedIds.length;
    const numEligible = eligibleIds.length;

    if (numSelected === 0) {
      selectAllRef.current.checked = false;
      selectAllRef.current.indeterminate = false;
    } else if (numSelected === numEligible && numEligible > 0) {
      selectAllRef.current.checked = true;
      selectAllRef.current.indeterminate = false;
    } else {
      selectAllRef.current.checked = false;
      selectAllRef.current.indeterminate = true;
    }
  }, [selectedIds, eligibleIds]);

  const handleToggleSelectAll = () => {
    if (selectedIds.length === eligibleIds.length && eligibleIds.length > 0) {
      // Clear selection
      setSelectedIds([]);
    } else {
      // Select all eligible projects
      setSelectedIds([...eligibleIds]);
    }
  };

  const handleToggleProject = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleAcceptProjects = async () => {
    if (selectedIds.length === 0 || isImporting) return;

    const toImport = projects.filter(p => selectedIds.includes(p.id));
    if (toImport.length === 0) return;

    setIsImporting(true);
    setFetchError(null);

    try {
      const report = await crmService.importProjects(toImport, currentUser);
      setImportReport(report);

      if (report.importedProjects.length > 0) {
        onProjectsImported?.(report.importedProjects);
      }

      // If all succeeded with zero failures, automatically close or allow review
      if (report.failedCount === 0) {
        // Keep brief review or close
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        // Refresh project list annotations so imported ones show Already Imported
        setProjects(prev =>
          prev.map(p => {
            const wasImported = report.importedProjects.some(
              imp => imp.crmMetadata?.externalId === p.id
            );
            return wasImported ? { ...p, isAlreadyImported: true } : p;
          })
        );
        // Deselect successful ones, keep failed ones selected for potential retry
        const failedIds = report.failedProjects.map(f => f.id);
        setSelectedIds(prev => prev.filter(id => failedIds.includes(id)));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setFetchError(message);
    } finally {
      setIsImporting(false);
    }
  };

  const formatCurrency = (val?: number) => {
    if (typeof val !== 'number') return null;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isImporting) onClose();
      }}
      title="Available Projects from ClientFlow"
      maxWidth="780px"
    >
      <div className="crm-modal-container">
        {/* Header Summary Banner */}
        <div className="crm-summary-banner" id="crm-summary-banner">
          <div className="crm-summary-icon">
            <Building2 size={20} className="text-brand" />
          </div>
          <div className="crm-summary-content">
            <div className="crm-summary-title">
              OJIX ClientFlow CRM Gateway
              <span className="badge badge-subtle-success" style={{ marginLeft: '8px' }}>
                Stage: WON
              </span>
            </div>
            <p className="crm-summary-text" id="crm-summary-text">
              {isLoading
                ? 'Connecting to OJIX ClientFlow CRM backend and verifying deals...'
                : `Found ${projects.length} available project${projects.length === 1 ? '' : 's'} from OJIX ClientFlow. Select the projects you want to import into TeamFlow.`}
            </p>
          </div>
          {!isLoading && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={loadCrmProjects}
              title="Refresh available projects"
              disabled={isImporting}
              id="crm-refresh-btn"
            >
              <RotateCw size={13} className={isLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          )}
        </div>

        {/* Global Fetch Error Alert */}
        {fetchError && (
          <div className="form-alert-error" id="crm-fetch-error-alert" style={{ marginBottom: '16px' }}>
            <AlertTriangle size={16} />
            <div style={{ flex: 1 }}>
              <strong>Fetch Error:</strong> {fetchError}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={loadCrmProjects}
              style={{ marginLeft: '8px' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Import Report Banner (if failures or partial results occurred) */}
        {importReport && (
          <div
            className={`crm-report-banner ${
              importReport.failedCount > 0 ? 'crm-report-partial' : 'crm-report-success'
            }`}
            id="crm-import-report-banner"
          >
            <div className="crm-report-header">
              {importReport.failedCount > 0 ? (
                <AlertTriangle size={18} className="text-warning" />
              ) : (
                <CheckCircle2 size={18} className="text-success" />
              )}
              <div className="crm-report-headline">
                {importReport.importedCount} project{importReport.importedCount === 1 ? '' : 's'} imported successfully.
                {importReport.failedCount > 0 && (
                  <span className="text-danger" style={{ marginLeft: '6px' }}>
                    {importReport.failedCount} project{importReport.failedCount === 1 ? '' : 's'} failed to import.
                  </span>
                )}
              </div>
            </div>

            {importReport.failedProjects.length > 0 && (
              <div className="crm-report-failures">
                <div className="crm-failures-title">Issues Encountered:</div>
                <ul className="crm-failures-list">
                  {importReport.failedProjects.map(f => (
                    <li key={f.id} className="crm-failure-item">
                      <span className="crm-failure-name">{f.name}:</span>
                      <span className="crm-failure-reason">{f.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Loading Spinner State */}
        {isLoading && (
          <div className="crm-loading-state" id="crm-loading-state">
            <div className="loading-spinner" />
            <p className="crm-loading-text">Fetching projects from OJIX ClientFlow CRM...</p>
          </div>
        )}

        {/* Main Selection Area */}
        {!isLoading && projects.length > 0 && (
          <>
            {/* Top Toolbar with Select All */}
            <div className="crm-toolbar">
              <label
                className={`crm-select-all-label ${eligibleProjects.length === 0 ? 'disabled' : ''}`}
                htmlFor="select-all-projects-checkbox"
              >
                <input
                  type="checkbox"
                  id="select-all-projects-checkbox"
                  ref={selectAllRef}
                  disabled={eligibleProjects.length === 0 || isImporting}
                  onChange={handleToggleSelectAll}
                />
                <span className="crm-select-all-text">Select All Projects</span>
              </label>

              <div className="crm-toolbar-stats">
                <span className="crm-stats-pill" id="crm-selected-count-pill">
                  {selectedIds.length} of {eligibleProjects.length} eligible selected
                </span>
              </div>
            </div>

            {/* Project Cards List */}
            <div className="crm-projects-list" id="crm-projects-list">
              {projects.map(proj => {
                const isSelected = selectedIds.includes(proj.id);
                const isEligible = !proj.isAlreadyImported && proj.isValidDateRange;
                const clientName = proj.client?.name;
                const formattedDealValue = formatCurrency(proj.dealValue);
                const displayName = (proj.name || proj.title || 'Untitled Project').trim();

                return (
                  <div
                    key={proj.id}
                    className={`crm-project-card ${isSelected ? 'selected' : ''} ${
                      proj.isAlreadyImported ? 'already-imported' : ''
                    } ${!proj.isValidDateRange ? 'invalid-dates' : ''}`}
                    id={`crm-project-card-${proj.id}`}
                    onClick={() => {
                      if (isEligible && !isImporting) {
                        handleToggleProject(proj.id);
                      }
                    }}
                  >
                    <div className="crm-card-header">
                      <div className="crm-card-checkbox-wrapper" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          id={`crm-checkbox-${proj.id}`}
                          aria-label={`Select ${displayName}`}
                          checked={isSelected}
                          disabled={!isEligible || isImporting}
                          onChange={() => handleToggleProject(proj.id)}
                        />
                      </div>

                      <div className="crm-card-title-section">
                        <div className="crm-card-title-row">
                          <h3 className="crm-card-title">{displayName}</h3>
                          <div className="crm-card-badges">
                            {proj.isAlreadyImported && (
                              <span className="badge badge-subtle-primary" id={`already-imported-badge-${proj.id}`}>
                                <Check size={11} /> Already Imported
                              </span>
                            )}
                            {proj.dealStage && (
                              <span className="badge badge-stage-won">
                                {proj.dealStage}
                              </span>
                            )}
                            {proj.temperature && (
                              <span
                                className={`badge ${
                                  proj.temperature.toUpperCase() === 'HOT'
                                    ? 'badge-temp-hot'
                                    : 'badge-temp-normal'
                                }`}
                              >
                                {proj.temperature.toUpperCase() === 'HOT' && <Flame size={11} />}
                                {proj.temperature}
                              </span>
                            )}
                            {proj.isReadyForExecution && (
                              <span className="badge badge-ready">
                                <ShieldCheck size={11} /> Ready for Execution
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Objective / Description */}
                        {proj.objective && (
                          <p className="crm-card-desc">{proj.objective}</p>
                        )}
                      </div>
                    </div>

                    {/* Invalid Date Alert Callout */}
                    {!proj.isValidDateRange && (
                      <div className="crm-card-warning-callout" id={`crm-date-warning-${proj.id}`}>
                        <AlertTriangle size={14} className="text-warning" />
                        <span>
                          <strong>Invalid Date Range:</strong> Target completion date ({proj.dueDate})
                          is earlier than start date ({proj.startDate}). Validation rules prohibit importing.
                        </span>
                      </div>
                    )}

                    {/* Card Metadata Footer */}
                    <div className="crm-card-footer">
                      {clientName && (
                        <div className="crm-meta-item" title={proj.client?.email || undefined}>
                          <Building2 size={13} className="crm-meta-icon" />
                          <span className="crm-meta-label">Client:</span>
                          <span className="crm-meta-value">{clientName}</span>
                        </div>
                      )}

                      {(proj.startDate || proj.dueDate) && (
                        <div className="crm-meta-item">
                          <Calendar size={13} className="crm-meta-icon" />
                          <span className="crm-meta-label">Timeline:</span>
                          <span className="crm-meta-value">
                            {proj.startDate ? formatDisplayDate(proj.startDate) : 'TBD'}
                            {' → '}
                            {proj.dueDate ? formatDisplayDate(proj.dueDate) : 'TBD'}
                          </span>
                        </div>
                      )}

                      {formattedDealValue && (
                        <div className="crm-meta-item">
                          <DollarSign size={13} className="crm-meta-icon" />
                          <span className="crm-meta-label">Deal Value:</span>
                          <span className="crm-meta-value font-mono">{formattedDealValue}</span>
                        </div>
                      )}

                      {proj.dealId && (
                        <div className="crm-meta-item">
                          <span className="crm-meta-label">CRM Deal:</span>
                          <span className="crm-meta-value font-mono">#{proj.dealId}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Empty State: No projects found */}
        {!isLoading && projects.length === 0 && !fetchError && (
          <div className="crm-empty-state" id="crm-empty-state">
            <FileText size={36} className="crm-empty-icon" />
            <h4 className="crm-empty-title">No Available Projects to Import</h4>
            <p className="crm-empty-text">
              There are currently no won deals ready for execution in OJIX ClientFlow CRM.
              Ensure projects have been closed and marked WON in the CRM before importing.
            </p>
            <Button variant="secondary" size="sm" onClick={loadCrmProjects}>
              <RotateCw size={13} /> Check Again
            </Button>
          </div>
        )}

        {/* Dialog Action Buttons */}
        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <Button
            variant="secondary"
            type="button"
            onClick={onClose}
            disabled={isImporting}
            id="crm-cancel-btn"
          >
            Cancel
          </Button>

          <Button
            variant="primary"
            type="button"
            disabled={selectedIds.length === 0 || isImporting}
            isLoading={isImporting}
            onClick={handleAcceptProjects}
            id="accept-crm-projects-btn"
          >
            <CheckCircle2 size={15} />
            <span>Accept Projects ({selectedIds.length})</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};
