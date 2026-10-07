import { Component } from "react";

// If one page crashes, show the reason on screen instead of a blank white page.
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="glass pad narrow">
        <h2>This page hit a problem</h2>
        <p className="mute">Please send this message to the developer:</p>
        <pre className="code">{String(this.state.error?.stack || this.state.error).slice(0, 600)}</pre>
        <a className="btn" href="#/">Back to home</a>
      </section>
    );
  }
}