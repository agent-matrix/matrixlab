import React from "react";
import { createRoot } from "react-dom/client";
import MatrixLabWarmPoolAdmin from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MatrixLabWarmPoolAdmin />
  </React.StrictMode>,
);
