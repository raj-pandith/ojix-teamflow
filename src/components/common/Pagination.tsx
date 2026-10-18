import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
  itemLabel?: string;
  className?: string;
  ariaLabel?: string;
  compact?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  pageSizeOptions = [10, 20, 50],
  onPageSizeChange,
  itemLabel = 'items',
  className = '',
  ariaLabel = 'Pagination navigation',
  compact = false,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  // Generate visible page numbers with intelligent ellipsis
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis')[] = [];
    pages.push(1);

    if (safeCurrentPage > 3) {
      pages.push('ellipsis');
    }

    const start = Math.max(2, safeCurrentPage - 1);
    const end = Math.min(totalPages - 1, safeCurrentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (safeCurrentPage < totalPages - 2) {
      pages.push('ellipsis');
    }

    pages.push(totalPages);
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <nav
      className={`pagination-container ${compact ? 'pagination-compact' : ''} ${className}`}
      aria-label={ariaLabel}
    >
      {/* Items count summary */}
      <div className="pagination-info">
        {totalItems > 0 ? (
          <>
            Showing <span className="pagination-count-range">{startItem}–{endItem}</span> of{' '}
            <span className="pagination-count-total">{totalItems}</span> {itemLabel}
          </>
        ) : (
          <>No {itemLabel} to display</>
        )}
      </div>

      <div className="pagination-controls">
        {/* Page Size Selector */}
        {onPageSizeChange && pageSizeOptions && pageSizeOptions.length > 1 && (
          <div className="pagination-page-size">
            <label htmlFor="pagination-size-select" className="pagination-size-label">
              Per page:
            </label>
            <select
              id="pagination-size-select"
              className="pagination-size-select"
              value={pageSize}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              aria-label={`Number of ${itemLabel} per page`}
            >
              {pageSizeOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Page Navigation Buttons */}
        <div className="pagination-buttons">
          {/* Jump to first */}
          {totalPages > 4 && !compact && (
            <button
              type="button"
              className="pagination-btn pagination-btn-nav"
              onClick={() => onPageChange(1)}
              disabled={safeCurrentPage === 1}
              title="First page"
              aria-label="Go to first page"
            >
              <ChevronsLeft size={14} />
            </button>
          )}

          {/* Previous */}
          <button
            type="button"
            className="pagination-btn pagination-btn-nav"
            onClick={() => onPageChange(safeCurrentPage - 1)}
            disabled={safeCurrentPage === 1}
            title="Previous page"
            aria-label="Go to previous page"
          >
            <ChevronLeft size={14} />
            {!compact && <span className="pagination-nav-text">Prev</span>}
          </button>

          {/* Page numbers */}
          {!compact && (
            <div className="pagination-pages-list">
              {pageNumbers.map((p, idx) => {
                if (p === 'ellipsis') {
                  return (
                    <span key={`ellipsis-${idx}`} className="pagination-ellipsis" aria-hidden="true">
                      …
                    </span>
                  );
                }
                const isActive = p === safeCurrentPage;
                return (
                  <button
                    key={p}
                    type="button"
                    className={`pagination-btn pagination-page-btn ${isActive ? 'is-active' : ''}`}
                    onClick={() => onPageChange(p)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={`Page ${p}`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          )}

          {compact && (
            <span className="pagination-compact-counter">
              {safeCurrentPage} / {totalPages}
            </span>
          )}

          {/* Next */}
          <button
            type="button"
            className="pagination-btn pagination-btn-nav"
            onClick={() => onPageChange(safeCurrentPage + 1)}
            disabled={safeCurrentPage >= totalPages}
            title="Next page"
            aria-label="Go to next page"
          >
            {!compact && <span className="pagination-nav-text">Next</span>}
            <ChevronRight size={14} />
          </button>

          {/* Jump to last */}
          {totalPages > 4 && !compact && (
            <button
              type="button"
              className="pagination-btn pagination-btn-nav"
              onClick={() => onPageChange(totalPages)}
              disabled={safeCurrentPage >= totalPages}
              title="Last page"
              aria-label="Go to last page"
            >
              <ChevronsRight size={14} />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};
