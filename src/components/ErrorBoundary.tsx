import { Component, type ReactNode } from 'react';

/** Keeps unexpected render failures recoverable, including malformed worker routes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main id="main" className="search-status" aria-labelledby="recovery-heading">
      <div role="alert"><h1 id="recovery-heading">Не удалось показать страницу</h1>
        <p>Обновите страницу, чтобы вернуться к поиску. Выбранные статьи сохранены в адресе.</p></div>
      <button className="recovery-button" type="button" onClick={() => location.reload()}>Обновить страницу</button>
    </main>;
    return this.props.children;
  }
}
