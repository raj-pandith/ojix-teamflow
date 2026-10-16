import React from 'react';

export const SkeletonCard: React.FC = () => {
  return (
    <div className="skeleton-card skeleton-shimmer">
      <div className="skeleton-line skeleton-title" />
      <div className="skeleton-line skeleton-body" />
      <div className="skeleton-line skeleton-meta" />
    </div>
  );
};

export const SkeletonRow: React.FC = () => {
  return (
    <tr className="skeleton-row skeleton-shimmer">
      <td colSpan={6}>
        <div className="skeleton-row-inner" />
      </td>
    </tr>
  );
};
