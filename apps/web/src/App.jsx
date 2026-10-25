// apps/web/src/App.jsx
// Root entry point for Daun Sense web portal.
import "./App.css";
import StoreProvider from "../../shared/StoreProvider.js";
import Site from "./components/Site.jsx";

export default function App() {
  return (
    <StoreProvider deviceId="web">
      <Site />
    </StoreProvider>
  );
}
