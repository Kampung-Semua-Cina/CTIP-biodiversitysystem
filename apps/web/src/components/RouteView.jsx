// apps/web/src/components/RouteView.jsx
// Resolves and renders the active page view based on route segments and user permissions.
import React, { Suspense } from "react";
// Core public views imported directly for instant zero-flash rendering
import { Home, About, Contact, StaffPage, NoAccess, NotFound } from "../pages/Public.jsx";
import Catalogue from "../pages/Catalogue.jsx";
import SpeciesPage from "../pages/SpeciesPage.jsx";
import Specimen from "../pages/Specimen.jsx";
import MapPage from "../pages/MapPage.jsx";
import { canAccess } from "../routes.js";

// Helper for staff/admin modules: lazy-load with graceful fallbacks so ad-blockers (e.g. uBlock Origin)
// intercepting module paths never crash the root application or prevent other pages from working.
function safeLazy(loader, pageName) {
  return React.lazy(() =>
    loader().catch((err) => {
      console.warn(`[Daun Sense] Failed to load module for ${pageName}:`, err);
      return {
        default: () => (
          <div className="glass pad" style={{ maxWidth: 640, margin: "24px auto" }}>
            <h2>Unable to load {pageName}</h2>
            <p className="mute">
              This module could not be loaded into your browser. If you have an ad blocker or privacy extension active
              (such as uBlock Origin), it may be blocking requests to local script files.
            </p>
            <p className="mute">
              You can disable your ad blocker for <code>localhost</code> or click below to retry.
            </p>
            <button className="btn" onClick={() => window.location.reload()}>
              Reload Page
            </button>
          </div>
        ),
      };
    })
  );
}

// Staff & Admin views loaded on-demand
const Login = safeLazy(() => import("../pages/Login.jsx"), "Login");
const Dashboard = safeLazy(() => import("../pages/Dashboard.jsx"), "Dashboard");
const AddPlant = safeLazy(() => import("../pages/AddPlant.jsx"), "Add Plant");
const Records = safeLazy(() => import("../pages/Records.jsx"), "Records");
const Review = safeLazy(() => import("../pages/Review.jsx"), "Review");
const ReportSummary = safeLazy(() => import("../pages/ReportSummary.jsx"), "Reports");
const Species = safeLazy(() => import("../pages/Species.jsx"), "Species Management");
const SensorOverview = safeLazy(() => import("../pages/SensorOverview.jsx"), "Monitoring");
const AdminUsers = safeLazy(() => import("../pages/Admin.jsx").then((m) => ({ default: m.Users })), "User Management");
const AdminAudit = safeLazy(() => import("../pages/Admin.jsx").then((m) => ({ default: m.Audit })), "Audit Log");
const Tags = safeLazy(() => import("../pages/Tags.jsx"), "Tags");
const AlertsNotice = safeLazy(() => import("../pages/AlertsNotice.jsx"), "Notifications");
const Discussion = safeLazy(() => import("../pages/Discussion.jsx"), "Discussion");
const Account = safeLazy(() => import("../pages/Account.jsx"), "Account");

export default function RouteView({ seg, arg, role }) {
  if (!canAccess(role, seg)) {
    return <NoAccess />;
  }

  // Instant public routes
  switch (seg) {
    case "": return <Home />;
    case "about": return <About />;
    case "contact": return <Contact />;
    case "staff": return <StaffPage />;
    case "plants": return arg ? <SpeciesPage key={arg} id={arg} /> : <Catalogue />;
    case "tag": return <Specimen key={arg} qr={arg} />;
    case "map": return <MapPage arg={arg} />;
    default: break;
  }

  // Staff and admin routes with Suspense fallback
  const renderStaffView = () => {
    switch (seg) {
      case "login": return <Login />;
      case "dashboard": return <Dashboard arg={arg} />;
      case "add": return <AddPlant />;
      case "records": return <Records />;
      case "review": return <Review />;
      case "reports": return <ReportSummary />;
      case "species": return <Species />;
      case "monitoring": return <SensorOverview />;
      case "users": return <AdminUsers />;
      case "audit": return <AdminAudit />;
      case "tags": return <Tags />;
      case "notifications": return <AlertsNotice />;
      case "discussion": return <Discussion arg={arg} />;
      case "account": return <Account />;
      default: return <NotFound />;
    }
  };

  return (
    <Suspense fallback={<div className="glass pad" style={{ margin: "24px auto", maxWidth: 600, textAlign: "center" }}><p className="mute">Loading view...</p></div>}>
      {renderStaffView()}
    </Suspense>
  );
}
