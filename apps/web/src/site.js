// web/src/site.js
export const SITE = "Daun Sense";
export const PARK = "Niah National Park";

// Fixed area drawn by the plant map. Dots are placed inside it, so a plant sits in the
// same spot for every role, whichever plants that role is allowed to see.
export const MAP_BOUNDS = { minLat: 3.79, maxLat: 3.816, minLng: 113.76, maxLng: 113.791 };

// Links in the top navbar (Home is the logo).
export const NAV = [
  { to: "/about", label: "About us" },
  { to: "/map", label: "Map" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/contact", label: "Contact" },
];
