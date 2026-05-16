import React from "react";
import { createRoot } from "react-dom/client";
import ConsoleApp from "./console/app.jsx";
import "./console/styles.css";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConsoleApp />
  </React.StrictMode>,
);
