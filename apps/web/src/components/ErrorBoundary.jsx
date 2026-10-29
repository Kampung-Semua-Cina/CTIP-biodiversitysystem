// apps/web/src/components/ErrorBoundary.jsx
import { Component } from "react";

// If one page crashes, show the reason on screen instead of a blank white page.
export default class ErrorBoundary extends Component {
  state = { error: null, where: "" };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error("Page crashed:", error, info?.componentStack);
    this.setState({ where: info?.componentStack || "" });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="glass pad narrow">
        <h2>This page hit a problem</h2>
        <p className="mute">Please send this message to the developer:</p>
        {/* Firefox's error.stack does not include the message, so show it first. */}
        <pre className="code">{[
          `${this.state.error?.name || "Error"}: ${this.state.error?.message || this.state.error}`,
          `Page: ${typeof window !== "undefined" ? window.location.hash || "#/" : ""}`,
          this.state.where && `In:${this.state.where.split("\n").slice(0, 6).join("\n")}`,
          String(this.state.error?.stack || "").slice(0, 600),
        ].filter(Boolean).join("\n\n")}</pre>
        <a className="btn" href="#/">Back to home</a>
      </section>
    );
  }
}