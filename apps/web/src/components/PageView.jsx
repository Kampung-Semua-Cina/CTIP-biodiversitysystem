// apps/web/src/components/PageView.jsx
// Resolves and renders the active page view based on route segments and user permissions.
import { Home, About, Contact, StaffPage, NoAccess, NotFound } from "../pages/Public.jsx";
import Login from "../pages/Login.jsx";
import Dashboard from "../pages/Dashboard.jsx";
import Catalogue from "../pages/Catalogue.jsx";
import SpeciesPage from "../pages/SpeciesPage.jsx";
import Specimen from "../pages/Specimen.jsx";
import MapPage from "../pages/MapPage.jsx";
import AddPlant from "../pages/AddPlant.jsx";
import Records from "../pages/Records.jsx";
import Review from "../pages/Review.jsx";
import Reports from "../pages/Reports.jsx";
import Species from "../pages/Species.jsx";
import Monitoring from "../pages/Monitoring.jsx";
import { Users, Audit } from "../pages/Admin.jsx";
import Tags from "../pages/Tags.jsx";
import Notifications from "../pages/Notifications.jsx";
import Discussion from "../pages/Discussion.jsx";
import Account from "../pages/Account.jsx";
import { canAccess } from "../routes.js";

export default function PageView({ seg, arg, role }) {
  if (!canAccess(role, seg)) {
    return <NoAccess />;
  }

  switch (seg) {
    case "": return <Home />;
    case "about": return <About />;
    case "contact": return <Contact />;
    case "staff": return <StaffPage />;
    case "login": return <Login />;
    case "dashboard": return <Dashboard arg={arg} />;
    case "plants": return arg ? <SpeciesPage key={arg} id={arg} /> : <Catalogue />;
    case "tag": return <Specimen key={arg} qr={arg} />;
    case "map": return <MapPage arg={arg} />;
    case "add": return <AddPlant />;
    case "records": return <Records />;
    case "review": return <Review />;
    case "reports": return <Reports />;
    case "species": return <Species />;
    case "monitoring": return <Monitoring />;
    case "users": return <Users />;
    case "audit": return <Audit />;
    case "tags": return <Tags />;
    case "notifications": return <Notifications />;
    case "discussion": return <Discussion arg={arg} />;
    case "account": return <Account />;
    default: return <NotFound />;
  }
}
