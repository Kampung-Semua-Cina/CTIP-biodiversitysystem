// apps/shared/publicContent.js

export const getAboutContent = (siteName, parkName) => ({
    title: `About ${siteName}`,
    paragraphs: [
        `${siteName} is a digital plant knowledge system for ${parkName}, built with Sarawak Forestry Corporation. Botanists record each plant once with a permanent QR tag. Conservation officers check the records, and approved records are shared here for researchers, park guides and visitors.`,
        `Field records work without a signal and sync when the phone is back online. Sensors near selected plants send readings to a monitoring page, so staff can respond quickly if something disturbs a protected plant.`
    ]
});

export const getHomeContent = (parkName) => ({
    heroTitle: `Know every plant in ${parkName}`,
    heroSubtitle: `Browse verified plant records from ${parkName}, see where each plant grows, and scan the tag on a plant in the forest to open its profile.`,
    features: [
        {
            icon: "leaf",
            title: "Plant library",
            text: "Search plant profiles with photos, names, families and where they grow.",
        },
        {
            icon: "qr",
            title: "One tag, one plant",
            text: "Every tagged plant keeps the same identity, so staff can follow it from visit to visit.",
        },
        {
            icon: "shield",
            title: "Protected species",
            text: "Locations of endangered plants stay hidden from the public.",
        },
    ],
    recentSectionTitle: "Recently published",
});

export const getContactContent = () => ({
    title: "Contact",
    email: "info@daunsense.example",
    organization: "Sarawak Forestry Corporation",
    address: "Kuching, Sarawak.",
});

export const getStaffPageContent = (parkName) => ({
    title: "Staff area",
    description: `This area is for Sarawak Forestry Corporation botanists, conservation officers and admins who record and review plants in ${parkName}. Accounts are created by an admin.`,
    visitorHint: "Just looking around? The plant library and map are open to everyone.",
});

export const getAccessContent = () => ({
    noAccessTitle: "You can't open this page",
    visitorText: "This page is for staff. Sign in to continue.",
    staffText: "Your role does not include this page. Use the menu to see what you can open.",
    notFoundTitle: "Page not found",
    notFoundText: "This page does not exist. Check the link, or start from the home page.",
});