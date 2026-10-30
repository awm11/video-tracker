import React from 'react';

/**
 * Last line of defence: if anything in the app throws while drawing the
 * page, show a calm message instead of a blank screen. Work is autosaved, so
 * reloading and reopening the same video brings it back.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Video Tracker crashed:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <div className="crash-card">
          <h1>Sorry — something went wrong 😕</h1>
          <p>Your tracking has been saved in this browser.</p>
          <p>Reload the page and open the same video again — it will offer to carry on where you left off.</p>
          <div className="btns">
            <button className="btn" onClick={() => this.setState({ error: null })}>Try to carry on</button>
            <button className="btn primary" onClick={() => window.location.reload()}>Reload the page</button>
          </div>
        </div>
      </div>
    );
  }
}
