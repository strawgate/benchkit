import { render } from "preact";
import "@benchkit/chart/css";
import { Dashboard } from "@benchkit/chart";

function App() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "#1e293b",
          color: "#f1f5f9",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <span style={{ fontSize: "1.5rem", fontWeight: 700 }}>Benchkit</span>
        <span style={{ fontSize: "0.875rem", color: "#94a3b8" }}>Self-Benchmarks</span>
      </header>
      <main style={{ flex: 1, padding: "24px" }}>
        <Dashboard
          source={{ owner: "strawgate", repo: "benchkit" }}
          seriesNameFormatter={(name) => name.replace(/^Benchmark/, "")}
          commitHref={(sha) => `https://github.com/strawgate/benchkit/commit/${sha}`}
          regressionThreshold={10}
          regressionWindow={5}
        />
      </main>
      <footer
        style={{
          textAlign: "center",
          padding: "12px",
          fontSize: "0.75rem",
          color: "#6b7280",
          borderTop: "1px solid #e5e7eb",
        }}
      >
        Powered by{" "}
        <a
          href="https://github.com/strawgate/benchkit"
          style={{ color: "#3b82f6" }}
        >
          benchkit
        </a>
      </footer>
    </div>
  );
}

render(<App />, document.getElementById("app")!);
