import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  id,
  className = '',
  required,
  ...props
}) => {
  const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className={`form-group ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={inputId} className="form-label">
        {label} {required && <span className="required-indicator">*</span>}
      </label>
      <input
        id={inputId}
        className="form-input"
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        required={required}
        {...props}
      />
      {error && (
        <span id={`${inputId}-error`} className="form-error-msg" role="alert">
          {error}
        </span>
      )}
      {!error && helperText && (
        <span className="form-helper-text">{helperText}</span>
      )}
    </div>
  );
};
