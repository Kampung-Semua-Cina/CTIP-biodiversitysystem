// apps/web/src/App.jsx
// Root entry point for Daun Sense web portal.
import "./App.css";
import StoreProvider from "../../shared/StoreProvider.js";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Site from "./components/Site.jsx";

export default function App() {
  return (
    <StoreProvider deviceId="web">
      <ErrorBoundary>
        <Site />
      </ErrorBoundary>
    </StoreProvider>
  );
}
