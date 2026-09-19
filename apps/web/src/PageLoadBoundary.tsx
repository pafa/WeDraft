import { Component, type ReactNode } from "react";

/** A failed optional page download must leave the editor and its draft available. */
export class PageLoadBoundary extends Component<{ children: ReactNode; onReturn: () => void }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  override render() {
    if (this.state.failed) return <main className="discovery-page" role="alert">
      <h1>页面暂时无法打开</h1>
      <p>请检查网络。可先返回编辑器导出原稿，再刷新网页重试。</p>
      <button className="button primary" onClick={this.props.onReturn}>返回编辑器</button>
    </main>;
    return this.props.children;
  }
}
