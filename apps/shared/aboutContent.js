//shared/aboutContent.js
export const getAboutContent = (siteName, parkName) => ({
  title: `About ${siteName}`,
  paragraphs: [
    `${siteName} is a digital plant knowledge system for ${parkName}, built with Sarawak Forestry Corporation. Botanists record each plant once with a permanent QR tag. Conservation officers check the records, and approved records are shared here for researchers, park guides and visitors.`,
    `Field records work without a signal and sync when the phone is back online. Sensors near selected plants send readings to a monitoring page, so staff can respond quickly if something disturbs a protected plant.`
  ]
});