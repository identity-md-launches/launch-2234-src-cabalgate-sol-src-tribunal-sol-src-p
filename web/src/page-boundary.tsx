import { Component, type ReactNode } from "react";
import { Icon } from "./components";
export class PageBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="error-box" role="alert">
        <p className="error-box__title">
          <Icon name="warning-circle" />
          Can’t show this page
        </p>
        <p className="small">
          Part of this page failed to draw. Nothing was sent; your funds are not
          affected.
        </p>
        <div className="btn-row">
          <button
            className="btn btn--sm"
            onClick={() => this.setState({ failed: false })}
          >
            Try again
          </button>
          <a className="btn btn--sm" href="#/">
            Home
          </a>
        </div>
      </div>
    ) : (
      this.props.children
    );
  }
}
