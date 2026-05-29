/* ============================================================
   hf-space.jsx — MatrixLab app shell (console-only).

   This app runs INSIDE a real Hugging Face Space, so Hugging Face
   already provides the page chrome (owner/repo, App·Files·Community
   tabs, "Running" badge, Settings, Restart). To avoid duplicating
   that navigation and the running/online status, MatrixLab renders
   ONLY the Matrix CLI Console — one console, one status, one input.
   ============================================================ */

function Space() {
  return (
    <main className="hf-app-wrap">
      <div className="hf-app-frame">
        <HFConsole />
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("hf-root")).render(<Space />);
