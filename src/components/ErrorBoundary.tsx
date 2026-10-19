import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { t } from '../utils/i18n';
import {
  boundaryErrorState,
  deriveBoundaryState,
  initialBoundaryState,
  type ErrorBoundaryState,
} from '../utils/errorBoundaryState';

interface Props {
  children: ReactNode;
  title?: string;
  theme?: 'dark' | 'light';
  onReset?: () => void;
  /** Ключ документа/вкладки: при смене ключа экран ошибки снимается сам. */
  resetKey?: unknown;
}

type State = ErrorBoundaryState;

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = initialBoundaryState(props.resetKey);
    this.handleReset = this.handleReset.bind(this);
  }

  public static getDerivedStateFromError(error: Error): Pick<State, 'hasError' | 'error'> {
    return boundaryErrorState(error);
  }

  public static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return deriveBoundaryState(props.resetKey, state);
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset() {
    this.setState({ hasError: false, error: null, resetKey: this.props.resetKey });
    if (this.props.onReset) {
      this.props.onReset();
    }
  }

  public render() {
    if (this.state.hasError) {
      const isDark = this.props.theme === 'dark';
      return (
        <div
          className={`flex flex-col items-center justify-center p-6 rounded-lg border text-center h-full min-h-[160px] ${
            isDark
              ? 'bg-slate-900/90 border-red-500/30 text-slate-200'
              : 'bg-red-50/90 border-red-200 text-slate-800'
          }`}
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-500/10 text-red-500 mb-3">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold mb-1">
            {this.props.title || t('Ошибка отображения')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4 font-mono break-words line-clamp-3">
            {this.state.error?.message || t('Произошла ошибка при отображении этого модуля.')}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('Перезапустить модуль')}</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
