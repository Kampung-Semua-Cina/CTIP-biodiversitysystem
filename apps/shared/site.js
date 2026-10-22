// apps/shared/site.js · used by the web and mobile apps
export const SITE = "Daun Sense";
export const PARK = "Niah National Park";
export const PARK_MAP = "https://maps.app.goo.gl/H8QrxBi3oWgya7Tk7";
export const FORESTRY = "https://sarawakforestry.com/";

// Fixed area drawn by the plant map. Dots are placed inside it, so a plant sits in the
// same spot for every role, whichever plants that role is allowed to see.
export const MAP_BOUNDS = { minLat: 3.79, maxLat: 3.816, minLng: 113.76, maxLng: 113.791 };

// Links in the top navbar (Home is the logo).
export const NAV = [
  { to: "/plants", label: "Plants" },
  { to: "/map", label: "Map" },
  { to: "/about", label: "About us" },
  { to: "/contact", label: "Contact" },
];
